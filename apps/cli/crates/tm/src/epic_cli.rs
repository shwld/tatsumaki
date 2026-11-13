use std::future::Future;

use clap::{Args, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tabled::{Table, Tabled, settings::Style};

use crate::{
    CliError, EXIT_GENERAL, EXIT_INVALID_ARGUMENT,
    adapters::artifact_gateway::parse_api_error,
    application::artifact_flow::{FlowError, TokenProvider},
    exit_code_for_error,
    infrastructure::project_file::require_project,
    is_unauthorized,
};

#[derive(Args, Debug)]
pub struct LabelCommand {
    #[command(subcommand)]
    pub command: LabelSubcommand,
}

#[derive(Subcommand, Debug)]
pub enum LabelSubcommand {
    /// List the labels of a project with their IDs
    List {
        #[arg(long)]
        project: Option<String>,
    },
    /// Create a label (color is a hex value such as #ff0000)
    Create {
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        name: String,
        #[arg(long)]
        color: String,
    },
    /// Show what deleting a label also removes: its story memberships and its epic with the plan
    DeletionImpact {
        #[arg(long)]
        project: Option<String>,
        label_id: String,
    },
}

#[derive(Args, Debug)]
pub struct EpicCommand {
    #[command(subcommand)]
    pub command: EpicSubcommand,
}

/// An epic is the strategy plan of one label. Writes take the revision you
/// last read; a newer one on the server is a conflict.
#[derive(Subcommand, Debug)]
pub enum EpicSubcommand {
    /// List the epics of a project, with planning on or off
    List {
        #[arg(long)]
        project: Option<String>,
    },
    /// Show the plan of a label
    Get {
        #[arg(long)]
        project: Option<String>,
        label_id: String,
    },
    /// Show progress of the epics with planning on, or of one label's epic with its stories
    Progress {
        #[arg(long)]
        project: Option<String>,
        label_id: Option<String>,
    },
    /// Turn strategy planning on. Restoring a saved plan needs --revision
    Enable {
        #[arg(long)]
        project: Option<String>,
        label_id: String,
        #[arg(long)]
        revision: Option<i64>,
    },
    /// Turn strategy planning off. The plan is kept
    Disable {
        #[arg(long)]
        project: Option<String>,
        label_id: String,
        #[arg(long)]
        revision: i64,
    },
    /// Save the plan. Only the given fields change
    Update {
        #[arg(long)]
        project: Option<String>,
        label_id: String,
        #[arg(long)]
        revision: i64,
        /// Plan of the epic (purpose and success criteria) as Markdown
        #[arg(long)]
        description: Option<String>,
        /// User ID of a project member; repeatable, replaces all owners
        #[arg(
            long = "owner",
            value_name = "USER_ID",
            conflicts_with = "clear_owners"
        )]
        owners: Vec<String>,
        #[arg(long, conflicts_with = "owners")]
        clear_owners: bool,
        /// YYYY-MM-DD; requires --planned-end
        #[arg(long, requires = "planned_end", conflicts_with = "clear_period")]
        planned_start: Option<String>,
        /// YYYY-MM-DD; requires --planned-start
        #[arg(long, requires = "planned_start", conflicts_with = "clear_period")]
        planned_end: Option<String>,
        #[arg(long)]
        clear_period: bool,
        /// Entered by a person; never inferred from story completion
        #[arg(long, value_enum)]
        outcome: Option<OutcomeArg>,
    },
}

#[derive(Copy, Clone, Debug, ValueEnum)]
pub enum OutcomeArg {
    Unevaluated,
    Achieved,
    Missed,
}

impl OutcomeArg {
    fn as_str(self) -> &'static str {
        match self {
            Self::Unevaluated => "unevaluated",
            Self::Achieved => "achieved",
            Self::Missed => "missed",
        }
    }
}

impl LabelSubcommand {
    pub fn project_slot(&mut self) -> &mut Option<String> {
        match self {
            Self::List { project }
            | Self::Create { project, .. }
            | Self::DeletionImpact { project, .. } => project,
        }
    }
}

impl EpicSubcommand {
    pub fn project_slot(&mut self) -> &mut Option<String> {
        match self {
            Self::List { project }
            | Self::Get { project, .. }
            | Self::Progress { project, .. }
            | Self::Enable { project, .. }
            | Self::Disable { project, .. }
            | Self::Update { project, .. } => project,
        }
    }
}

/// The output types are the CLI's own so that `--json` does not change when
/// the server adds a field.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelInfo {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicInfo {
    pub id: String,
    pub label_id: String,
    pub label_name: String,
    pub enabled: bool,
    pub description: String,
    pub owner_ids: Vec<String>,
    pub planned_start: Option<String>,
    pub planned_end: Option<String>,
    pub outcome_status: String,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletionImpactEpic {
    pub id: String,
    pub enabled: bool,
    pub has_plan: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletionImpact {
    pub label_id: String,
    pub label_name: String,
    pub story_count: i64,
    pub epic: Option<DeletionImpactEpic>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryCounts {
    pub total: i64,
    pub accepted: i64,
    pub in_progress: i64,
    pub unstarted: i64,
    pub icebox: i64,
    pub blocked: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointCounts {
    pub estimated_points: i64,
    pub accepted_points: i64,
    pub excluded_stories: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressInfo {
    pub state: String,
    pub story_completion_rate: Option<f64>,
    pub stories: StoryCounts,
    pub point_completion_rate: Option<f64>,
    pub points: PointCounts,
    pub overdue: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicWithProgress {
    pub epic: EpicInfo,
    pub progress: ProgressInfo,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicStoryInfo {
    pub id: String,
    pub story_number: i64,
    pub title: String,
    #[serde(rename = "type")]
    pub story_type: String,
    pub status: String,
    pub is_icebox: bool,
    pub is_blocked: bool,
    pub story_point: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProgressListBody {
    epics: Vec<EpicWithProgress>,
    total: StoryCounts,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProgressDetailBody {
    epic: EpicInfo,
    progress: ProgressInfo,
    stories: Vec<EpicStoryInfo>,
}

#[derive(Tabled)]
struct ProgressRow {
    label: String,
    state: String,
    progress: String,
    accepted: i64,
    #[tabled(rename = "in progress")]
    in_progress: i64,
    unstarted: i64,
    icebox: i64,
    blocked: i64,
    period: String,
    overdue: String,
}

#[derive(Tabled)]
struct EpicStoryRow {
    #[tabled(rename = "#")]
    number: i64,
    status: String,
    #[tabled(rename = "type")]
    story_type: String,
    point: String,
    flags: String,
    title: String,
}

fn percent(rate: Option<f64>) -> String {
    match rate {
        Some(rate) => format!("{:.0}%", rate * 100.0),
        None => "-".to_string(),
    }
}

fn progress_row(item: &EpicWithProgress) -> ProgressRow {
    let s = &item.progress.stories;
    ProgressRow {
        label: item.epic.label_name.clone(),
        state: item.progress.state.clone(),
        progress: format!(
            "{}/{} {}",
            s.accepted,
            s.total,
            percent(item.progress.story_completion_rate)
        ),
        accepted: s.accepted,
        in_progress: s.in_progress,
        unstarted: s.unstarted,
        icebox: s.icebox,
        blocked: s.blocked,
        period: period(&item.epic),
        overdue: if item.progress.overdue {
            "overdue"
        } else {
            "-"
        }
        .to_string(),
    }
}

fn story_row(story: &EpicStoryInfo) -> EpicStoryRow {
    let mut flags = Vec::new();
    if story.is_icebox {
        flags.push("icebox");
    }
    if story.is_blocked {
        flags.push("blocked");
    }
    EpicStoryRow {
        number: story.story_number,
        status: story.status.clone(),
        story_type: story.story_type.clone(),
        point: story.story_point.map_or("-".to_string(), |p| p.to_string()),
        flags: if flags.is_empty() {
            "-".to_string()
        } else {
            flags.join(",")
        },
        title: story.title.clone(),
    }
}

#[derive(Deserialize)]
struct LabelBody {
    label: LabelInfo,
}
#[derive(Deserialize)]
struct LabelsBody {
    labels: Vec<LabelInfo>,
}
#[derive(Deserialize)]
struct EpicsBody {
    epics: Vec<EpicInfo>,
}
#[derive(Deserialize)]
struct EpicBody {
    epic: EpicInfo,
}

/// Builds the PATCH body. The planned period is sent as a pair, as the server requires.
pub fn plan_body(command: &EpicSubcommand) -> Result<Value, String> {
    let EpicSubcommand::Update {
        revision,
        description,
        owners,
        clear_owners,
        planned_start,
        planned_end,
        clear_period,
        outcome,
        ..
    } = command
    else {
        return Err("not an update command".to_string());
    };
    let mut body = Map::new();
    if let Some(value) = description {
        body.insert("description".into(), Value::from(value.as_str()));
    }
    if *clear_owners {
        body.insert("ownerIds".into(), Value::Array(Vec::new()));
    } else if !owners.is_empty() {
        body.insert("ownerIds".into(), Value::from(owners.clone()));
    }
    match (planned_start, planned_end) {
        (Some(start), Some(end)) => {
            body.insert("plannedStart".into(), Value::from(start.as_str()));
            body.insert("plannedEnd".into(), Value::from(end.as_str()));
        }
        _ if *clear_period => {
            body.insert("plannedStart".into(), Value::Null);
            body.insert("plannedEnd".into(), Value::Null);
        }
        _ => {}
    }
    if let Some(value) = outcome {
        body.insert("outcomeStatus".into(), Value::from(value.as_str()));
    }
    if body.is_empty() {
        return Err(
            "nothing to update: pass --description, --owner/--clear-owners, --planned-start with --planned-end/--clear-period, or --outcome"
                .to_string(),
        );
    }
    body.insert("revision".into(), Value::from(*revision));
    Ok(Value::Object(body))
}

pub(crate) struct EpicClient<'a, T: TokenProvider> {
    pub(crate) base_url: &'a str,
    pub(crate) project: String,
    pub(crate) tokens: &'a T,
    pub(crate) client: reqwest::Client,
}

impl<T: TokenProvider + Sync> EpicClient<'_, T> {
    pub(crate) fn url(&self, path: &str) -> String {
        format!(
            "{}/programmatic-api/v1/projects/{}{}",
            self.base_url.trim_end_matches('/'),
            urlencoding::encode(&self.project),
            path
        )
    }

    fn label_url(&self, label_id: &str, suffix: &str) -> String {
        self.url(&format!(
            "/labels/{}{suffix}",
            urlencoding::encode(label_id)
        ))
    }

    async fn with_token<R, F, Fut>(&self, op: F) -> Result<R, FlowError>
    where
        F: Fn(String) -> Fut,
        Fut: Future<Output = Result<R, CliError>>,
    {
        let token = self.tokens.access_token(self.base_url).await?;
        match op(token).await {
            Err(error)
                if matches!(error, CliError::Api { status: 401, .. })
                    || is_unauthorized(&error) =>
            {
                let token = self.tokens.refresh_access_token(self.base_url).await?;
                op(token).await.map_err(|e| {
                    let code = exit_code_for_error(&e);
                    (e, code)
                })
            }
            other => other.map_err(|e| {
                let code = exit_code_for_error(&e);
                (e, code)
            }),
        }
    }

    pub(crate) async fn send<R: serde::de::DeserializeOwned>(
        &self,
        method: reqwest::Method,
        url: String,
        body: Option<&Value>,
    ) -> Result<R, FlowError> {
        self.with_token(|token| {
            let mut request = self.client.request(method.clone(), &url).bearer_auth(token);
            if let Some(body) = body {
                request = request.json(body);
            }
            async move {
                let response = request.send().await?;
                let status = response.status();
                if status.is_success() {
                    return Ok(response.json::<R>().await?);
                }
                let text = response.text().await.unwrap_or_default();
                Err(parse_api_error(status.as_u16(), &text, None))
            }
        })
        .await
    }
}

pub(crate) fn print_json<T: Serialize>(value: &T) -> Result<(), FlowError> {
    println!(
        "{}",
        serde_json::to_string_pretty(value).map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
    );
    Ok(())
}

#[derive(Tabled)]
struct EpicRow {
    label: String,
    #[tabled(rename = "label id")]
    label_id: String,
    planning: String,
    period: String,
    outcome: String,
    revision: i64,
}

fn period(epic: &EpicInfo) -> String {
    match (&epic.planned_start, &epic.planned_end) {
        (Some(start), Some(end)) => format!("{start}..{end}"),
        _ => "-".to_string(),
    }
}

fn print_epic(epic: &EpicInfo, json: bool) -> Result<(), FlowError> {
    if json {
        return print_json(epic);
    }
    println!("label: {} ({})", epic.label_name, epic.label_id);
    println!("planning: {}", if epic.enabled { "on" } else { "off" });
    println!("description: {}", epic.description);
    println!(
        "owners: {}",
        if epic.owner_ids.is_empty() {
            "-".to_string()
        } else {
            epic.owner_ids.join(", ")
        }
    );
    println!("period: {}", period(epic));
    println!("outcome: {}", epic.outcome_status);
    println!("revision: {}", epic.revision);
    Ok(())
}

/// Resolves `--label` values to label IDs. A value is matched as an ID first, then as a name; the API itself only takes IDs.
pub async fn resolve_label_ids<T: TokenProvider + Sync>(
    base_url: &str,
    project: &str,
    tokens: &T,
    specs: &[String],
) -> Result<Vec<String>, FlowError> {
    if specs.is_empty() {
        return Ok(Vec::new());
    }
    let client = EpicClient {
        base_url,
        project: project.to_string(),
        tokens,
        client: reqwest::Client::new(),
    };
    let body: LabelsBody = client
        .send(reqwest::Method::GET, client.url("/labels"), None)
        .await?;
    pick_label_ids(&body.labels, specs)
        .map_err(|message| (CliError::Message(message), EXIT_INVALID_ARGUMENT))
}

fn pick_label_ids(labels: &[LabelInfo], specs: &[String]) -> Result<Vec<String>, String> {
    let mut ids: Vec<String> = Vec::new();
    for spec in specs {
        let found = labels
            .iter()
            .find(|label| &label.id == spec)
            .or_else(|| labels.iter().find(|label| &label.name == spec));
        let Some(label) = found else {
            return Err(format!(
                "Invalid label: no label with ID or name \"{spec}\" in the project (see `tm label list`)"
            ));
        };
        if !ids.contains(&label.id) {
            ids.push(label.id.clone());
        }
    }
    Ok(ids)
}

pub async fn run_label<T: TokenProvider + Sync>(
    command: LabelCommand,
    base_url: &str,
    tokens: &T,
    json: bool,
) -> Result<(), FlowError> {
    let mut command = command.command;
    let client = EpicClient {
        base_url,
        project: require_project(command.project_slot().take())?,
        tokens,
        client: reqwest::Client::new(),
    };
    match command {
        LabelSubcommand::List { .. } => {
            let body: LabelsBody = client
                .send(reqwest::Method::GET, client.url("/labels"), None)
                .await?;
            if json {
                return print_json(&body.labels);
            }
            #[derive(Tabled)]
            struct Row<'a> {
                id: &'a str,
                name: &'a str,
                color: &'a str,
            }
            let rows: Vec<Row> = body
                .labels
                .iter()
                .map(|l| Row {
                    id: &l.id,
                    name: &l.name,
                    color: &l.color,
                })
                .collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            Ok(())
        }
        LabelSubcommand::Create { name, color, .. } => {
            let body: LabelBody = client
                .send(
                    reqwest::Method::POST,
                    client.url("/labels"),
                    Some(&serde_json::json!({ "name": name, "color": color })),
                )
                .await?;
            if json {
                return print_json(&body.label);
            }
            println!("created label: {} ({})", body.label.name, body.label.id);
            Ok(())
        }
        LabelSubcommand::DeletionImpact { label_id, .. } => {
            let impact: DeletionImpact = client
                .send(
                    reqwest::Method::GET,
                    client.label_url(&label_id, "/deletion-impact"),
                    None,
                )
                .await?;
            if json {
                return print_json(&impact);
            }
            println!("label: {} ({})", impact.label_name, impact.label_id);
            println!("stories losing the label: {}", impact.story_count);
            match impact.epic {
                Some(epic) => println!(
                    "epic: {} (planning {}, {})",
                    epic.id,
                    if epic.enabled { "on" } else { "off" },
                    if epic.has_plan {
                        "its plan is deleted too; turning planning off keeps it"
                    } else {
                        "no plan saved"
                    }
                ),
                None => println!("epic: none"),
            }
            Ok(())
        }
    }
}

pub async fn run_epic<T: TokenProvider + Sync>(
    command: EpicCommand,
    base_url: &str,
    tokens: &T,
    json: bool,
) -> Result<(), FlowError> {
    let mut command = command.command;
    let client = EpicClient {
        base_url,
        project: require_project(command.project_slot().take())?,
        tokens,
        client: reqwest::Client::new(),
    };
    match &command {
        EpicSubcommand::List { .. } => {
            let body: EpicsBody = client
                .send(reqwest::Method::GET, client.url("/epics"), None)
                .await?;
            if json {
                return print_json(&body.epics);
            }
            let rows: Vec<EpicRow> = body
                .epics
                .iter()
                .map(|e| EpicRow {
                    label: e.label_name.clone(),
                    label_id: e.label_id.clone(),
                    planning: if e.enabled { "on" } else { "off" }.to_string(),
                    period: period(e),
                    outcome: e.outcome_status.clone(),
                    revision: e.revision,
                })
                .collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            Ok(())
        }
        EpicSubcommand::Progress { label_id: None, .. } => {
            let body: ProgressListBody = client
                .send(reqwest::Method::GET, client.url("/epics/progress"), None)
                .await?;
            if json {
                return print_json(&body);
            }
            let rows: Vec<ProgressRow> = body.epics.iter().map(progress_row).collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            let t = &body.total;
            println!(
                "total (shared stories counted once): {}/{} accepted, {} in progress, {} unstarted, {} icebox, {} blocked",
                t.accepted, t.total, t.in_progress, t.unstarted, t.icebox, t.blocked
            );
            Ok(())
        }
        EpicSubcommand::Progress {
            label_id: Some(label_id),
            ..
        } => {
            let body: ProgressDetailBody = client
                .send(
                    reqwest::Method::GET,
                    client.label_url(label_id, "/epic/progress"),
                    None,
                )
                .await?;
            if json {
                return print_json(&body);
            }
            print_epic(&body.epic, false)?;
            let p = &body.progress;
            println!(
                "state: {}{}",
                p.state,
                if p.overdue { " (overdue)" } else { "" }
            );
            println!(
                "stories: {}/{} accepted ({}), {} in progress, {} unstarted, {} icebox, {} blocked",
                p.stories.accepted,
                p.stories.total,
                percent(p.story_completion_rate),
                p.stories.in_progress,
                p.stories.unstarted,
                p.stories.icebox,
                p.stories.blocked
            );
            println!(
                "points (estimated features only): {}/{} accepted ({}), {} stories not counted",
                p.points.accepted_points,
                p.points.estimated_points,
                percent(p.point_completion_rate),
                p.points.excluded_stories
            );
            let rows: Vec<EpicStoryRow> = body.stories.iter().map(story_row).collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            Ok(())
        }
        EpicSubcommand::Get { label_id, .. } => {
            let body: EpicBody = client
                .send(
                    reqwest::Method::GET,
                    client.label_url(label_id, "/epic"),
                    None,
                )
                .await?;
            print_epic(&body.epic, json)
        }
        EpicSubcommand::Enable {
            label_id, revision, ..
        } => {
            let payload = match revision {
                Some(revision) => serde_json::json!({ "revision": revision }),
                None => serde_json::json!({}),
            };
            let body: EpicBody = client
                .send(
                    reqwest::Method::POST,
                    client.label_url(label_id, "/epic/enable"),
                    Some(&payload),
                )
                .await?;
            print_epic(&body.epic, json)
        }
        EpicSubcommand::Disable {
            label_id, revision, ..
        } => {
            let payload = serde_json::json!({ "revision": revision });
            let body: EpicBody = client
                .send(
                    reqwest::Method::POST,
                    client.label_url(label_id, "/epic/disable"),
                    Some(&payload),
                )
                .await?;
            print_epic(&body.epic, json)
        }
        EpicSubcommand::Update { label_id, .. } => {
            let payload =
                plan_body(&command).map_err(|m| (CliError::Message(m), EXIT_INVALID_ARGUMENT))?;
            let body: EpicBody = client
                .send(
                    reqwest::Method::PATCH,
                    client.label_url(label_id, "/epic"),
                    Some(&payload),
                )
                .await?;
            print_epic(&body.epic, json)
        }
    }
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::*;

    fn label(id: &str, name: &str) -> LabelInfo {
        LabelInfo {
            id: id.to_string(),
            name: name.to_string(),
            color: "#000000".to_string(),
        }
    }

    #[test]
    fn pick_label_ids_resolves_by_id_then_name_without_duplicates() {
        let labels = vec![label("l1", "backend"), label("l2", "l1")];
        let ids = pick_label_ids(
            &labels,
            &["backend".to_string(), "l1".to_string(), "l1".to_string()],
        )
        .unwrap();
        assert_eq!(ids, vec!["l1".to_string()]);
    }

    #[test]
    fn pick_label_ids_rejects_unknown_label() {
        let error = pick_label_ids(&[label("l1", "backend")], &["nope".to_string()]).unwrap_err();
        assert!(error.contains("Invalid label"), "{error}");
    }

    #[derive(Parser)]
    struct Harness {
        #[command(subcommand)]
        command: EpicSubcommand,
    }

    fn parse(args: &[&str]) -> Result<EpicSubcommand, clap::Error> {
        Harness::try_parse_from(std::iter::once("tm").chain(args.iter().copied()))
            .map(|h| h.command)
    }

    #[test]
    fn update_sends_only_given_fields_with_the_revision() {
        let command = parse(&[
            "update",
            "label-1",
            "--revision",
            "3",
            "--description",
            "Purpose",
            "--planned-start",
            "2026-11-01",
            "--planned-end",
            "2026-11-30",
            "--outcome",
            "achieved",
        ])
        .unwrap();
        assert_eq!(
            plan_body(&command).unwrap(),
            serde_json::json!({
                "revision": 3,
                "description": "Purpose",
                "plannedStart": "2026-11-01",
                "plannedEnd": "2026-11-30",
                "outcomeStatus": "achieved",
            })
        );
    }

    #[test]
    fn owners_are_sent_as_a_list() {
        let command = parse(&[
            "update",
            "label-1",
            "--revision",
            "2",
            "--owner",
            "u1",
            "--owner",
            "u2",
        ])
        .unwrap();
        assert_eq!(
            plan_body(&command).unwrap(),
            serde_json::json!({ "revision": 2, "ownerIds": ["u1", "u2"] })
        );
    }

    #[test]
    fn clearing_sends_nulls() {
        let command = parse(&[
            "update",
            "label-1",
            "--revision",
            "1",
            "--clear-owners",
            "--clear-period",
        ])
        .unwrap();
        assert_eq!(
            plan_body(&command).unwrap(),
            serde_json::json!({
                "revision": 1,
                "ownerIds": [],
                "plannedStart": null,
                "plannedEnd": null,
            })
        );
    }

    #[test]
    fn period_needs_both_dates_and_update_needs_a_field() {
        assert!(
            parse(&[
                "update",
                "l",
                "--revision",
                "1",
                "--planned-start",
                "2026-11-01"
            ])
            .is_err()
        );
        assert!(
            parse(&[
                "update",
                "l",
                "--revision",
                "1",
                "--owner",
                "u",
                "--clear-owners"
            ])
            .is_err()
        );
        let empty = parse(&["update", "l", "--revision", "1"]).unwrap();
        assert!(plan_body(&empty).is_err());
    }

    #[test]
    fn disable_requires_a_revision() {
        assert!(parse(&["disable", "label-1"]).is_err());
        assert!(matches!(
            parse(&["enable", "label-1"]).unwrap(),
            EpicSubcommand::Enable { revision: None, .. }
        ));
    }
}
