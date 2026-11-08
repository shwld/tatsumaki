mod adapters;
mod application;
mod artifact;
mod artifact_cli;
mod desktop_ipc_client;
mod desktop_ipc_command;
mod epic_cli;
mod infrastructure;
mod update;

use crate::application::ports::{
    StoryBlockerAction, StoryBlockerInput, StoryBlockerRelation, StoryCommentInput,
    StoryCreateInput, StoryListFilter, StoryPointUpdate, StoryReorderInput, StoryUpdateInput,
    TokenStore,
};
use adapters::{
    config_store::FileConfigStore,
    http_gateways::{
        HttpAuthGateway, HttpProjectGateway, HttpStoryGateway, HttpUserGateway, HttpVersionGateway,
    },
    token_store::KeyringTokenStore,
};
use application::service::{CliService, resolve_base_url};
use clap::{Args, Parser, Subcommand, ValueEnum};
use desktop_ipc_client::DEFAULT_IPC_TIMEOUT_MS;
use desktop_ipc_command::{DesktopRefetchKind, execute_refetch};
use infrastructure::{
    config_file::config_path,
    project_file::{find_project_file, optional_project, require_project},
};
use tabled::{Table, Tabled, settings::Style};
use url::Url;

pub const EXIT_GENERAL: i32 = 1;
pub const EXIT_INVALID_ARGUMENT: i32 = 2;
pub const EXIT_AUTH: i32 = 3;
pub const EXIT_NOT_FOUND: i32 = 4;
pub const EXIT_CONFIG: i32 = 5;
pub const EXIT_DESKTOP_IPC: i32 = 6;
pub const EXIT_CONFLICT: i32 = 7;

#[derive(Debug, thiserror::Error)]
pub enum CliError {
    #[error("{0}")]
    Message(String),
    #[error("Request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Failed to serialize/deserialize: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Invalid config file: {0}")]
    Toml(#[from] toml::de::Error),
    /// An error answered by the artifact API; `code` is the server's
    /// machine-readable error code.
    #[error("{message}")]
    Api {
        status: u16,
        code: String,
        message: String,
        retry_after_secs: Option<u64>,
    },
}

#[derive(Parser, Debug)]
#[command(name = "tm")]
#[command(about = "tatsumaki CLI")]
#[command(version)]
struct Cli {
    #[arg(long)]
    base_url: Option<String>,
    #[arg(long)]
    json: bool,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Config(ConfigCommand),
    Login,
    Logout,
    Whoami,
    Story(StoryCommand),
    Artifact(artifact_cli::ArtifactCommand),
    Label(epic_cli::LabelCommand),
    Epic(epic_cli::EpicCommand),
    Project(ProjectCommand),
    Desktop(DesktopCommand),
    Update(UpdateCommand),
}

#[derive(Args, Debug)]
struct UpdateCommand {
    #[arg(long, help = "Only check whether a newer version is available")]
    check: bool,
    #[arg(
        long,
        value_name = "TAG",
        help = "Install a specific release tag (cli-vX.Y.Z)"
    )]
    version: Option<String>,
}

#[derive(Args, Debug)]
struct ConfigCommand {
    #[command(subcommand)]
    command: ConfigSubcommand,
}

#[derive(Subcommand, Debug)]
enum ConfigSubcommand {
    Set { key: String, value: String },
    Get { key: String },
    Show,
}

#[derive(Args, Debug)]
struct StoryCommand {
    #[command(subcommand)]
    command: StorySubcommand,
}

#[derive(Subcommand, Debug)]
enum StorySubcommand {
    Archive {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
    },
    Unarchive {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
    },
    Get {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
    },
    List {
        #[arg(long)]
        project: Option<String>,
        #[arg(long, value_enum)]
        status: Option<StoryStatusArg>,
        #[arg(long, value_enum)]
        iteration: Option<IterationScopeArg>,
        /// Only list stories in the Icebox
        #[arg(long, conflicts_with = "iteration")]
        icebox: bool,
        #[arg(long)]
        archived: bool,
        /// Only stories carrying any of these labels (label ID or name; repeatable)
        #[arg(long = "label", value_name = "ID_OR_NAME")]
        labels: Vec<String>,
        #[arg(long)]
        limit: Option<u32>,
    },
    Create {
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        title: String,
        #[arg(long = "type")]
        story_type: StoryTypeArg,
        #[arg(long)]
        description: String,
        #[arg(long, default_value_t = false)]
        is_icebox: bool,
        /// Label to attach (label ID or name; repeatable)
        #[arg(long = "label", value_name = "ID_OR_NAME")]
        labels: Vec<String>,
    },
    Update {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        description: Option<String>,
        #[arg(long = "type")]
        story_type: Option<StoryTypeArg>,
        #[arg(long, conflicts_with = "clear_story_point")]
        story_point: Option<i64>,
        #[arg(long, conflicts_with = "story_point")]
        clear_story_point: bool,
        #[arg(long, conflicts_with = "no_icebox")]
        icebox: bool,
        #[arg(long, conflicts_with = "icebox")]
        no_icebox: bool,
        #[arg(long = "owner", value_name = "USER_ID", conflicts_with = "clear_owners")]
        owners: Vec<String>,
        #[arg(long, conflicts_with = "owners")]
        clear_owners: bool,
        /// Replace the whole label set (label ID or name; repeatable)
        #[arg(long = "label", value_name = "ID_OR_NAME", conflicts_with_all = ["clear_labels", "add_labels", "remove_labels"])]
        labels: Vec<String>,
        /// Add a label, keeping the others (label ID or name; repeatable)
        #[arg(long = "add-label", value_name = "ID_OR_NAME")]
        add_labels: Vec<String>,
        /// Remove a label (label ID or name; repeatable)
        #[arg(long = "remove-label", value_name = "ID_OR_NAME")]
        remove_labels: Vec<String>,
        /// Remove every label
        #[arg(long, conflicts_with_all = ["labels", "add_labels", "remove_labels"])]
        clear_labels: bool,
    },
    Status {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
        #[arg(long, value_enum)]
        status: StoryStatusArg,
    },
    Comment {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
        #[arg(long)]
        body: String,
    },
    /// Make <STORY_NUMBER> blocked by --by, or blocking --blocks
    Block {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
        #[command(flatten)]
        relation: StoryBlockerRelationArgs,
    },
    /// Remove a blocker registered with `story block`
    Unblock {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
        #[command(flatten)]
        relation: StoryBlockerRelationArgs,
    },
    /// Change story priority (order) by listing story IDs from highest to lowest priority
    ///
    /// Earlier --ordered-id values get higher priority. --ordered-id takes the internal story ID
    /// (the `id` field of `tm --json story list`), not the story number. Only the stories you list
    /// are rearranged, and only among the positions they already occupy; unlisted stories keep
    /// their positions, so a newly listed story does not move to the end of the Backlog on its own.
    /// To move story N to the end of the Backlog, list the current last Backlog story first, then N.
    /// This changes priority only: status, Icebox and iteration assignment are untouched, so Current
    /// assignment is not released (use `unassign-iteration` for that).
    Reorder {
        #[arg(long)]
        project: Option<String>,
        /// Internal story ID (not the story number); repeat from highest to lowest priority
        #[arg(long = "ordered-id")]
        ordered_ids: Vec<String>,
    },
    /// Remove an Unstarted story from its iteration so it returns to the Backlog
    ///
    /// Only the iteration assignment is cleared; status, position and points are unchanged.
    /// Re-running on a story that is not assigned succeeds with `changed: false`.
    UnassignIteration {
        #[arg(long)]
        project: Option<String>,
        story_number: i64,
    },
}

impl StorySubcommand {
    fn project_slot(&mut self) -> &mut Option<String> {
        match self {
            Self::Archive { project, .. } | Self::Unarchive { project, .. } => project,
            Self::Get { project, .. }
            | Self::List { project, .. }
            | Self::Create { project, .. }
            | Self::Update { project, .. }
            | Self::Status { project, .. }
            | Self::Comment { project, .. }
            | Self::Block { project, .. }
            | Self::Unblock { project, .. }
            | Self::Reorder { project, .. }
            | Self::UnassignIteration { project, .. } => project,
        }
    }

    fn blocker_action(&self) -> Option<StoryBlockerAction> {
        match self {
            Self::Block { .. } => Some(StoryBlockerAction::Add),
            Self::Unblock { .. } => Some(StoryBlockerAction::Remove),
            _ => None,
        }
    }
}

#[derive(Args, Debug)]
#[group(required = true, multiple = false)]
struct StoryBlockerRelationArgs {
    /// Story number that blocks <STORY_NUMBER>
    #[arg(long, value_name = "STORY_NUMBER")]
    by: Option<i64>,
    /// Story number that <STORY_NUMBER> blocks
    #[arg(long, value_name = "STORY_NUMBER")]
    blocks: Option<i64>,
}

impl StoryBlockerRelationArgs {
    fn into_relation(self) -> (StoryBlockerRelation, i64) {
        match (self.by, self.blocks) {
            (Some(target), _) => (StoryBlockerRelation::BlockedBy, target),
            (None, Some(target)) => (StoryBlockerRelation::Blocks, target),
            (None, None) => unreachable!("clap requires one of --by and --blocks"),
        }
    }
}

fn describe_story_blocker_change(
    story_number: i64,
    input: &StoryBlockerInput,
    changed: bool,
) -> String {
    let target = input.target_story_number;
    let (blocking, blocked) = match input.relation {
        StoryBlockerRelation::BlockedBy => (target, story_number),
        StoryBlockerRelation::Blocks => (story_number, target),
    };
    match (input.action, changed) {
        (StoryBlockerAction::Add, true) => {
            format!("#{blocked} は #{blocking} にブロックされています")
        }
        (StoryBlockerAction::Add, false) => {
            format!("既に登録済みです: #{blocked} は #{blocking} にブロックされています")
        }
        (StoryBlockerAction::Remove, true) => {
            format!("#{blocked} は #{blocking} にブロックされなくなりました")
        }
        (StoryBlockerAction::Remove, false) => {
            format!("登録されていません: #{blocked} は #{blocking} にブロックされていません")
        }
    }
}

fn describe_story_iteration_unassign(story_number: i64, changed: bool) -> String {
    if changed {
        format!("#{story_number} を iteration から外しました(Backlog に戻りました)")
    } else {
        format!("iteration に割り当てられていません: #{story_number}")
    }
}

#[derive(Args, Debug)]
struct ProjectCommand {
    #[command(subcommand)]
    command: ProjectSubcommand,
}

#[derive(Subcommand, Debug)]
enum ProjectSubcommand {
    Get { project_id: Option<String> },
}

#[derive(Args, Debug)]
struct DesktopCommand {
    #[command(subcommand)]
    command: DesktopSubcommand,
}

#[derive(Subcommand, Debug)]
enum DesktopSubcommand {
    Refetch {
        #[arg(long)]
        project: Option<String>,
        #[arg(long, value_enum, default_value_t = DesktopRefetchTypeArg::Stories)]
        r#type: DesktopRefetchTypeArg,
        #[arg(long, default_value_t = DEFAULT_IPC_TIMEOUT_MS)]
        timeout_ms: u64,
    },
}

#[derive(Copy, Clone, Debug, ValueEnum)]
enum DesktopRefetchTypeArg {
    Stories,
    Screen,
}

impl DesktopRefetchTypeArg {
    fn as_refetch_kind(&self) -> DesktopRefetchKind {
        match self {
            Self::Stories => DesktopRefetchKind::Stories,
            Self::Screen => DesktopRefetchKind::Screen,
        }
    }
}

#[derive(Copy, Clone, Debug, ValueEnum)]
enum StoryStatusArg {
    Unstarted,
    Started,
    Finished,
    Delivered,
    Accepted,
    Rejected,
}

impl StoryStatusArg {
    fn as_api_str(&self) -> &'static str {
        match self {
            Self::Unstarted => "Unstarted",
            Self::Started => "Started",
            Self::Finished => "Finished",
            Self::Delivered => "Delivered",
            Self::Accepted => "Accepted",
            Self::Rejected => "Rejected",
        }
    }
}

#[derive(Copy, Clone, Debug, ValueEnum)]
enum IterationScopeArg {
    Current,
}

#[derive(Copy, Clone, Debug, ValueEnum)]
enum StoryTypeArg {
    Feature,
    Bug,
    Chore,
    Release,
}

impl StoryTypeArg {
    fn as_api_str(&self) -> &'static str {
        match self {
            Self::Feature => "feature",
            Self::Bug => "bug",
            Self::Chore => "chore",
            Self::Release => "release",
        }
    }
}

impl IterationScopeArg {
    fn as_api_str(&self) -> &'static str {
        match self {
            Self::Current => "current",
        }
    }
}

#[derive(Tabled)]
struct StoryListRow {
    #[tabled(rename = "#")]
    number: String,
    #[tabled(rename = "status")]
    status: String,
    #[tabled(rename = "point")]
    point: String,
    #[tabled(rename = "title")]
    title: String,
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let code = match run().await {
        Ok(()) => 0,
        Err((err, code)) => {
            eprintln!("{err}");
            code
        }
    };
    std::process::exit(code);
}

pub fn is_unauthorized(error: &CliError) -> bool {
    error.to_string().contains("Unauthorized")
}

pub fn exit_code_for_error(error: &CliError) -> i32 {
    if let CliError::Api { status, code, .. } = error {
        return exit_code_for_api_error(*status, code);
    }
    let msg = error.to_string();
    if msg.contains("Unauthorized") {
        EXIT_AUTH
    } else if msg.contains("status 400")
        || msg.contains("Invalid")
        || msg.contains("must be")
        || msg.contains("required")
    {
        EXIT_INVALID_ARGUMENT
    } else if msg.contains("Story not found") || msg.contains("Project not found") {
        EXIT_NOT_FOUND
    } else {
        EXIT_GENERAL
    }
}

/// Exit code for an API error answered with `{ error, code }`. The server's `code` decides; the
/// message text is never inspected (it can contain words like "required").
pub fn exit_code_for_api_error(status: u16, code: &str) -> i32 {
    match code {
        "UNAUTHORIZED" | "FORBIDDEN" => EXIT_AUTH,
        "BASE_VERSION_CONFLICT"
        | "PUBLISH_CONFLICT"
        | "REVISION_CONFLICT"
        | "REVISION_REQUIRED" => EXIT_CONFLICT,
        "NOT_FOUND" | "ARTIFACT_NOT_FOUND" | "VERSION_NOT_FOUND" | "FILE_NOT_FOUND"
        | "SESSION_NOT_FOUND" | "LABEL_NOT_FOUND" | "EPIC_NOT_FOUND" => EXIT_NOT_FOUND,
        "INVALID_REQUEST"
        | "INVALID_OWNER"
        | "INVALID_DESCRIPTION"
        | "INVALID_SUCCESS_CRITERIA"
        | "INVALID_PLANNED_PERIOD"
        | "INVALID_OUTCOME_STATUS"
        | "EMPTY_MANIFEST"
        | "INVALID_PATH"
        | "DUPLICATE_PATH"
        | "SENSITIVE_FILE"
        | "INVALID_SIZE"
        | "INVALID_SHA256"
        | "INVALID_ENTRYPOINT"
        | "TOO_MANY_FILES"
        | "FILE_TOO_LARGE"
        | "TOTAL_TOO_LARGE"
        | "UNSUPPORTED_MEDIA_TYPE"
        | "IDEMPOTENCY_KEY_REUSED"
        | "TREE_DIGEST_MISMATCH"
        | "FILE_NOT_IN_MANIFEST"
        | "FILE_SIZE_MISMATCH"
        | "FILE_DIGEST_MISMATCH" => EXIT_INVALID_ARGUMENT,
        _ if status == 401 => EXIT_AUTH,
        _ if status == 403 => EXIT_AUTH,
        _ if status == 404 => EXIT_NOT_FOUND,
        _ => EXIT_GENERAL,
    }
}

async fn run() -> Result<(), (CliError, i32)> {
    let cli = Cli::parse();

    let config_store = FileConfigStore;
    let token_store = KeyringTokenStore;

    match cli.command {
        Commands::Config(config) => run_config(config_store, config),
        Commands::Login => {
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            service.login(&base_url).await?;
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            println!("Login successful");
            Ok(())
        }
        Commands::Update(update_cmd) => {
            let outcome = update::run(update_cmd.check, update_cmd.version.as_deref())
                .await
                .map_err(|e| (e, EXIT_GENERAL))?;
            match outcome {
                update::Outcome::UpToDate(version) => println!("tm {version} is up to date"),
                update::Outcome::Available(target) => {
                    println!("Update available: {} ({})", target.version, target.tag)
                }
                update::Outcome::Updated { from, to } => {
                    println!("Updated tm {from} -> {}", to.version)
                }
            }
            Ok(())
        }
        Commands::Logout => {
            token_store.clear().map_err(|e| (e, EXIT_AUTH))?;
            println!("Logged out");
            Ok(())
        }
        Commands::Whoami => {
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            let user = service.whoami(&base_url).await?;
            if cli.json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&user)
                        .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                );
            } else {
                println!("id: {}", user.id);
                if let Some(email) = user.email {
                    println!("email: {email}");
                }
                if let Some(name) = user.display_name {
                    println!("displayName: {name}");
                }
            }
            Ok(())
        }
        Commands::Artifact(mut artifact_cmd) => {
            let slot = artifact_cmd.command.project_slot();
            *slot = Some(require_project(slot.take())?);
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            artifact_cli::run_artifact(artifact_cmd, &base_url, &service, cli.json).await
        }
        Commands::Label(mut label_cmd) => {
            let slot = label_cmd.command.project_slot();
            *slot = Some(require_project(slot.take())?);
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            epic_cli::run_label(label_cmd, &base_url, &service, cli.json).await
        }
        Commands::Epic(mut epic_cmd) => {
            let slot = epic_cmd.command.project_slot();
            *slot = Some(require_project(slot.take())?);
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            epic_cli::run_epic(epic_cmd, &base_url, &service, cli.json).await
        }
        Commands::Story(mut story_cmd) => {
            let slot = story_cmd.command.project_slot();
            *slot = Some(require_project(slot.take())?);
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            let blocker_action = story_cmd.command.blocker_action();
            let archive_action = matches!(&story_cmd.command, StorySubcommand::Archive { .. });
            match story_cmd.command {
                StorySubcommand::Archive {
                    project,
                    story_number,
                }
                | StorySubcommand::Unarchive {
                    project,
                    story_number,
                } => {
                    let project = require_project(project)?;
                    let body = service
                        .set_story_archived(&base_url, &project, story_number, archive_action)
                        .await?;
                    let output = if cli.json {
                        serde_json::to_value(&body)
                    } else {
                        Ok(body.story)
                    }
                    .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?;
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&output)
                            .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                    );
                }
                StorySubcommand::Get {
                    project,
                    story_number,
                } => {
                    let project = require_project(project)?;
                    let body = service
                        .get_story(&base_url, &project, story_number, cli.json)
                        .await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body.story)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    }
                }
                StorySubcommand::List {
                    project,
                    status,
                    iteration,
                    icebox,
                    archived,
                    labels,
                    limit,
                } => {
                    let project = require_project(project)?;
                    let label_ids =
                        epic_cli::resolve_label_ids(&base_url, &project, &service, &labels).await?;
                    let filter = StoryListFilter {
                        status: status.map(|s| s.as_api_str().to_string()),
                        iteration_date_scope: iteration.map(|i| i.as_api_str().to_string()),
                        icebox,
                        archived,
                        label_ids,
                        limit,
                    };
                    let body = service.list_stories(&base_url, &project, &filter).await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        let rows: Vec<StoryListRow> = body
                            .stories
                            .iter()
                            .map(|s| StoryListRow {
                                number: s
                                    .get("storyNumber")
                                    .and_then(|v| v.as_i64())
                                    .map(|n| format!("#{n}"))
                                    .unwrap_or_default(),
                                status: s
                                    .get("status")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                point: s
                                    .get("storyPoint")
                                    .and_then(|v| v.as_i64())
                                    .map(|p| p.to_string())
                                    .unwrap_or("-".to_string()),
                                title: s
                                    .get("title")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                            })
                            .collect();
                        println!("{}", Table::new(rows).with(Style::sharp()));
                    }
                }
                StorySubcommand::Create {
                    project,
                    title,
                    story_type,
                    description,
                    is_icebox,
                    labels,
                } => {
                    let project = require_project(project)?;
                    let label_ids =
                        epic_cli::resolve_label_ids(&base_url, &project, &service, &labels).await?;
                    let input = StoryCreateInput {
                        title,
                        r#type: story_type.as_api_str().to_string(),
                        description,
                        is_icebox,
                        label_ids,
                    };
                    let body = service.create_story(&base_url, &project, &input).await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body.story)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    }
                }
                StorySubcommand::Update {
                    project,
                    story_number,
                    title,
                    description,
                    story_type,
                    story_point,
                    clear_story_point,
                    icebox,
                    no_icebox,
                    owners,
                    clear_owners,
                    labels,
                    add_labels,
                    remove_labels,
                    clear_labels,
                } => {
                    let project = require_project(project)?;
                    let label_ids = if clear_labels {
                        Some(Vec::new())
                    } else if labels.is_empty() {
                        None
                    } else {
                        Some(
                            epic_cli::resolve_label_ids(&base_url, &project, &service, &labels)
                                .await?,
                        )
                    };
                    let add_label_ids =
                        epic_cli::resolve_label_ids(&base_url, &project, &service, &add_labels)
                            .await?;
                    let remove_label_ids =
                        epic_cli::resolve_label_ids(&base_url, &project, &service, &remove_labels)
                            .await?;
                    let input = StoryUpdateInput {
                        title,
                        description,
                        r#type: story_type.map(|t| t.as_api_str().to_string()),
                        story_point: if clear_story_point {
                            Some(StoryPointUpdate::Clear)
                        } else {
                            story_point.map(StoryPointUpdate::Set)
                        },
                        status: None,
                        is_icebox: if icebox {
                            Some(true)
                        } else if no_icebox {
                            Some(false)
                        } else {
                            None
                        },
                        owner_ids: if clear_owners {
                            Some(Vec::new())
                        } else if owners.is_empty() {
                            None
                        } else {
                            Some(owners)
                        },
                        label_ids,
                        add_label_ids,
                        remove_label_ids,
                    };
                    let body = service
                        .update_story(&base_url, &project, story_number, &input)
                        .await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body.story)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    }
                }
                StorySubcommand::Status {
                    project,
                    story_number,
                    status,
                } => {
                    let project = require_project(project)?;
                    let input = StoryUpdateInput {
                        title: None,
                        description: None,
                        r#type: None,
                        story_point: None,
                        status: Some(status.as_api_str().to_string()),
                        is_icebox: None,
                        owner_ids: None,
                        ..Default::default()
                    };
                    let body = service
                        .update_story(&base_url, &project, story_number, &input)
                        .await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body.story)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    }
                }
                StorySubcommand::Comment {
                    project,
                    story_number,
                    body,
                } => {
                    let project = require_project(project)?;
                    let input = StoryCommentInput { body };
                    let comment = service
                        .create_story_comment(&base_url, &project, story_number, &input)
                        .await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&comment)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&comment)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    }
                }
                StorySubcommand::Block {
                    project,
                    story_number,
                    relation,
                }
                | StorySubcommand::Unblock {
                    project,
                    story_number,
                    relation,
                } => {
                    let project = require_project(project)?;
                    let (relation, target_story_number) = relation.into_relation();
                    let input = StoryBlockerInput {
                        action: blocker_action.expect("block and unblock set an action"),
                        relation,
                        target_story_number,
                    };
                    let body = service
                        .change_story_blocker(&base_url, &project, story_number, &input)
                        .await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        let changed = body
                            .get("changed")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);
                        println!(
                            "{}",
                            describe_story_blocker_change(story_number, &input, changed)
                        );
                    }
                }
                StorySubcommand::UnassignIteration {
                    project,
                    story_number,
                } => {
                    let project = require_project(project)?;
                    let body = service
                        .unassign_story_iteration(&base_url, &project, story_number)
                        .await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        let changed = body
                            .get("changed")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);
                        println!("{}", describe_story_iteration_unassign(story_number, changed));
                    }
                }
                StorySubcommand::Reorder {
                    project,
                    ordered_ids,
                } => {
                    let project = require_project(project)?;
                    let input = StoryReorderInput { ordered_ids };
                    let body = service.reorder_stories(&base_url, &project, &input).await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        let rows: Vec<StoryListRow> = body
                            .stories
                            .iter()
                            .map(|s| StoryListRow {
                                number: s
                                    .get("storyNumber")
                                    .and_then(|v| v.as_i64())
                                    .map(|n| format!("#{n}"))
                                    .unwrap_or_default(),
                                status: s
                                    .get("status")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                point: s
                                    .get("storyPoint")
                                    .and_then(|v| v.as_i64())
                                    .map(|p| p.to_string())
                                    .unwrap_or("-".to_string()),
                                title: s
                                    .get("title")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                            })
                            .collect();
                        println!("{}", Table::new(rows).with(Style::sharp()));
                    }
                }
            }
            Ok(())
        }
        Commands::Project(mut project_cmd) => {
            let ProjectSubcommand::Get { project_id } = &mut project_cmd.command;
            *project_id = Some(require_project(project_id.take())?);
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            match project_cmd.command {
                ProjectSubcommand::Get { project_id } => {
                    let project_id = require_project(project_id)?;
                    let body = service.get_project(&base_url, &project_id).await?;
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&body)
                                .map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
                        );
                    } else {
                        let p = &body.project;
                        if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
                            println!("id: {id}");
                        }
                        if let Some(name) = p.get("name").and_then(|v| v.as_str()) {
                            println!("name: {name}");
                        }
                    }
                }
            }
            Ok(())
        }
        Commands::Desktop(desktop_cmd) => match desktop_cmd.command {
            DesktopSubcommand::Refetch {
                project,
                r#type,
                timeout_ms,
            } => {
                let project = optional_project(project)?;
                let (request_id, ipc_type, project) =
                    execute_refetch(project, r#type.as_refetch_kind(), timeout_ms).await?;
                if cli.json {
                    println!(
                        "{}",
                        serde_json::json!({
                            "ok": true,
                            "requestId": request_id,
                            "type": ipc_type,
                            "projectId": project
                        })
                    );
                } else {
                    println!("desktop refetch request accepted ({request_id})");
                }
                Ok(())
            }
        },
    }
}

fn build_service(
    base_url: String,
) -> CliService<
    KeyringTokenStore,
    FileConfigStore,
    HttpAuthGateway,
    HttpStoryGateway,
    HttpUserGateway,
    HttpVersionGateway,
    HttpProjectGateway,
> {
    CliService {
        token_store: KeyringTokenStore,
        config_store: FileConfigStore,
        auth_gateway: HttpAuthGateway {
            base_url: base_url.clone(),
            client: reqwest::Client::new(),
        },
        story_gateway: HttpStoryGateway {
            base_url: base_url.clone(),
            client: reqwest::Client::new(),
        },
        user_gateway: HttpUserGateway {
            base_url: base_url.clone(),
            client: reqwest::Client::new(),
        },
        version_gateway: HttpVersionGateway {
            base_url: base_url.clone(),
        },
        project_gateway: HttpProjectGateway { base_url },
    }
}

fn run_config(
    config_store: FileConfigStore,
    command: ConfigCommand,
) -> Result<(), (CliError, i32)> {
    match command.command {
        ConfigSubcommand::Set { key, value } => {
            if key != "base-url" {
                return Err((
                    CliError::Message(format!("Unsupported key: {key}")),
                    EXIT_CONFIG,
                ));
            }
            validate_base_url(&value).map_err(|e| (CliError::Message(e), EXIT_CONFIG))?;
            use crate::application::ports::ConfigStore;
            config_store
                .save_base_url(&value)
                .map_err(|e| (e, EXIT_CONFIG))?;
            println!("base-url updated");
            Ok(())
        }
        ConfigSubcommand::Get { key } => {
            if key != "base-url" {
                return Err((
                    CliError::Message(format!("Unsupported key: {key}")),
                    EXIT_CONFIG,
                ));
            }
            use crate::application::ports::ConfigStore;
            if let Some(v) = config_store.load_base_url().map_err(|e| (e, EXIT_CONFIG))? {
                println!("{v}");
                Ok(())
            } else {
                Err((
                    CliError::Message("base-url is not configured".to_string()),
                    EXIT_CONFIG,
                ))
            }
        }
        ConfigSubcommand::Show => {
            use crate::application::ports::ConfigStore;
            println!(
                "# global: {}",
                config_path().map_err(|e| (e, EXIT_CONFIG))?.display()
            );
            println!("{}", config_store.show_raw().map_err(|e| (e, EXIT_CONFIG))?);
            let cwd = std::env::current_dir().map_err(|e| (CliError::Io(e), EXIT_CONFIG))?;
            match find_project_file(&cwd) {
                Some(path) => {
                    println!("# project: {}", path.display());
                    println!(
                        "{}",
                        std::fs::read_to_string(&path)
                            .map_err(|e| (CliError::Io(e), EXIT_CONFIG))?
                    );
                }
                None => println!("# project: (no tatsumaki.toml found)"),
            }
            Ok(())
        }
    }
}

pub fn validate_base_url(raw: &str) -> Result<(), String> {
    let parsed = Url::parse(raw).map_err(|e| format!("Invalid base-url: {e}"))?;
    match parsed.scheme() {
        "https" => Ok(()),
        "http" => {
            let host = parsed.host_str().unwrap_or_default();
            if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" {
                Ok(())
            } else {
                Err(
                    "Only loopback hosts may use http://; use https:// for non-loopback"
                        .to_string(),
                )
            }
        }
        other => Err(format!("Unsupported URL scheme: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn story_archive_commands_and_filter_parse() {
        for action in ["archive", "unarchive"] {
            let parsed = Cli::try_parse_from(["tm", "story", action, "42"]).unwrap();
            assert!(matches!(parsed.command, Commands::Story(StoryCommand { command: StorySubcommand::Archive { story_number: 42, .. } | StorySubcommand::Unarchive { story_number: 42, .. } })));
        }
        let parsed = Cli::try_parse_from(["tm", "story", "list", "--archived"]).unwrap();
        assert!(matches!(parsed.command, Commands::Story(StoryCommand { command: StorySubcommand::List { archived: true, .. } })));
    }

    #[test]
    fn story_unassign_iteration_parses_and_reports_result() {
        let parsed = Cli::try_parse_from([
            "tm",
            "story",
            "unassign-iteration",
            "--project",
            "p",
            "389",
        ])
        .expect("unassign-iteration should parse");
        assert!(matches!(
            parsed.command,
            Commands::Story(StoryCommand {
                command: StorySubcommand::UnassignIteration {
                    story_number: 389,
                    ..
                }
            })
        ));
        assert!(Cli::try_parse_from(["tm", "story", "unassign-iteration"]).is_err());
        assert!(describe_story_iteration_unassign(389, true).contains("Backlog"));
        assert!(describe_story_iteration_unassign(389, false).contains("割り当てられていません"));
    }

    #[test]
    fn story_type_arg_accepts_release() {
        let parsed = <StoryTypeArg as clap::ValueEnum>::from_str("release", true)
            .expect("release should be a valid story type argument");

        assert_eq!(parsed.as_api_str(), "release");
    }

    #[test]
    fn story_update_accepts_story_point() {
        let parsed = Cli::try_parse_from([
            "tm",
            "story",
            "update",
            "--project",
            "project-1",
            "286",
            "--story-point",
            "5",
        ])
        .expect("story point should be accepted");

        let Commands::Story(StoryCommand {
            command:
                StorySubcommand::Update {
                    story_point,
                    clear_story_point,
                    ..
                },
        }) = parsed.command
        else {
            panic!("expected story update command");
        };
        assert_eq!(story_point, Some(5));
        assert!(!clear_story_point);
    }

    fn parse_story_blocker(
        args: &[&str],
    ) -> Result<(StoryBlockerAction, i64, StoryBlockerRelation, i64), clap::Error> {
        let mut argv = vec!["tm", "story"];
        argv.extend_from_slice(args);
        let parsed = Cli::try_parse_from(argv)?;
        let Commands::Story(StoryCommand { command }) = parsed.command else {
            panic!("expected story command");
        };
        let action = command.blocker_action().expect("block or unblock");
        let (StorySubcommand::Block {
            story_number,
            relation,
            ..
        }
        | StorySubcommand::Unblock {
            story_number,
            relation,
            ..
        }) = command
        else {
            panic!("expected block or unblock");
        };
        let (relation, target) = relation.into_relation();
        Ok((action, story_number, relation, target))
    }

    #[test]
    fn story_block_takes_exactly_one_of_by_and_blocks() {
        assert_eq!(
            parse_story_blocker(&["block", "--project", "p", "328", "--by", "325"]).unwrap(),
            (
                StoryBlockerAction::Add,
                328,
                StoryBlockerRelation::BlockedBy,
                325
            )
        );
        assert_eq!(
            parse_story_blocker(&["unblock", "--project", "p", "328", "--blocks", "330"]).unwrap(),
            (
                StoryBlockerAction::Remove,
                328,
                StoryBlockerRelation::Blocks,
                330
            )
        );
        assert!(parse_story_blocker(&["block", "--project", "p", "328"]).is_err());
        assert!(
            parse_story_blocker(&[
                "block",
                "--project",
                "p",
                "328",
                "--by",
                "1",
                "--blocks",
                "2"
            ])
            .is_err()
        );
    }

    #[test]
    fn story_blocker_result_is_stated_as_a_sentence() {
        let input = |action, relation| StoryBlockerInput {
            action,
            relation,
            target_story_number: 325,
        };
        assert_eq!(
            describe_story_blocker_change(
                328,
                &input(StoryBlockerAction::Add, StoryBlockerRelation::BlockedBy),
                true
            ),
            "#328 は #325 にブロックされています"
        );
        assert_eq!(
            describe_story_blocker_change(
                328,
                &input(StoryBlockerAction::Add, StoryBlockerRelation::Blocks),
                true
            ),
            "#325 は #328 にブロックされています"
        );
        assert_eq!(
            describe_story_blocker_change(
                328,
                &input(StoryBlockerAction::Add, StoryBlockerRelation::BlockedBy),
                false
            ),
            "既に登録済みです: #328 は #325 にブロックされています"
        );
        assert_eq!(
            describe_story_blocker_change(
                328,
                &input(StoryBlockerAction::Remove, StoryBlockerRelation::BlockedBy),
                true
            ),
            "#328 は #325 にブロックされなくなりました"
        );
        assert_eq!(
            describe_story_blocker_change(
                328,
                &input(StoryBlockerAction::Remove, StoryBlockerRelation::BlockedBy),
                false
            ),
            "登録されていません: #328 は #325 にブロックされていません"
        );
    }

    #[test]
    fn story_update_accepts_clear_story_point() {
        let parsed = Cli::try_parse_from([
            "tm",
            "story",
            "update",
            "--project",
            "project-1",
            "286",
            "--clear-story-point",
        ])
        .expect("clear story point should be accepted");

        let Commands::Story(StoryCommand {
            command:
                StorySubcommand::Update {
                    story_point,
                    clear_story_point,
                    ..
                },
        }) = parsed.command
        else {
            panic!("expected story update command");
        };
        assert_eq!(story_point, None);
        assert!(clear_story_point);
    }

    #[test]
    fn story_update_accepts_multiple_owners() {
        let parsed = Cli::try_parse_from([
            "tm",
            "story",
            "update",
            "--project",
            "project-1",
            "350",
            "--owner",
            "user-1",
            "--owner",
            "user-2",
        ])
        .expect("owners should be accepted");

        let Commands::Story(StoryCommand {
            command:
                StorySubcommand::Update {
                    owners,
                    clear_owners,
                    ..
                },
        }) = parsed.command
        else {
            panic!("expected story update command");
        };
        assert_eq!(owners, vec!["user-1".to_string(), "user-2".to_string()]);
        assert!(!clear_owners);
    }

    #[test]
    fn story_update_takes_label_flags_and_rejects_mixing_replace_with_add() {
        let parsed = Cli::try_parse_from([
            "tm", "story", "update", "--project", "p", "1", "--add-label", "bug", "--remove-label", "old",
        ])
        .expect("add/remove labels should be accepted");
        let Commands::Story(StoryCommand {
            command: StorySubcommand::Update { add_labels, remove_labels, labels, .. },
        }) = parsed.command
        else {
            panic!("expected story update command");
        };
        assert_eq!(add_labels, vec!["bug".to_string()]);
        assert_eq!(remove_labels, vec!["old".to_string()]);
        assert!(labels.is_empty());

        assert!(Cli::try_parse_from([
            "tm", "story", "update", "--project", "p", "1", "--label", "a", "--add-label", "b",
        ])
        .is_err());
        assert!(Cli::try_parse_from([
            "tm", "story", "update", "--project", "p", "1", "--clear-labels", "--label", "a",
        ])
        .is_err());
    }

    #[test]
    fn story_update_accepts_clear_owners() {
        let parsed = Cli::try_parse_from([
            "tm",
            "story",
            "update",
            "--project",
            "project-1",
            "350",
            "--clear-owners",
        ])
        .expect("clear owners should be accepted");

        let Commands::Story(StoryCommand {
            command:
                StorySubcommand::Update {
                    owners,
                    clear_owners,
                    ..
                },
        }) = parsed.command
        else {
            panic!("expected story update command");
        };
        assert!(owners.is_empty());
        assert!(clear_owners);
    }

    #[test]
    fn story_update_rejects_setting_and_clearing_owners_together() {
        let result = Cli::try_parse_from([
            "tm",
            "story",
            "update",
            "--project",
            "project-1",
            "350",
            "--owner",
            "user-1",
            "--clear-owners",
        ]);

        assert!(result.is_err());
    }

    #[test]
    fn story_update_rejects_setting_and_clearing_story_point_together() {
        let result = Cli::try_parse_from([
            "tm",
            "story",
            "update",
            "--project",
            "project-1",
            "286",
            "--story-point",
            "5",
            "--clear-story-point",
        ]);

        assert!(result.is_err());
    }

    #[test]
    fn story_update_accepts_icebox_flags_but_not_both() {
        let parse = |flag: &str| {
            Cli::try_parse_from(["tm", "story", "update", "--project", "p", "332", flag])
        };
        assert!(parse("--icebox").is_ok());
        assert!(parse("--no-icebox").is_ok());
        assert!(
            Cli::try_parse_from([
                "tm",
                "story",
                "update",
                "--project",
                "p",
                "332",
                "--icebox",
                "--no-icebox",
            ])
            .is_err()
        );
    }

    // --- tm artifact ---

    use crate::artifact_cli::{ArtifactCommand, ArtifactSubcommand};

    fn parse_artifact(args: &[&str]) -> Result<ArtifactSubcommand, clap::Error> {
        let mut argv = vec!["tm", "artifact"];
        argv.extend_from_slice(args);
        let cli = Cli::try_parse_from(argv)?;
        let Commands::Artifact(ArtifactCommand { command }) = cli.command else {
            panic!("expected an artifact command");
        };
        Ok(command)
    }

    #[test]
    fn artifact_create_needs_title_and_path() {
        assert!(
            parse_artifact(&["create", "--project", "p", "--title", "T", "--path", "dist"]).is_ok()
        );
        assert!(parse_artifact(&["create", "--path", "dist"]).is_err());
        assert!(parse_artifact(&["create", "--project", "p", "--path", "dist"]).is_err());
        assert!(parse_artifact(&["create", "--project", "p", "--title", "T"]).is_err());
    }

    #[test]
    fn artifact_update_needs_a_base_version_exactly_when_a_directory_is_given() {
        assert!(parse_artifact(&["update", "--project", "p", "A1", "--title", "New"]).is_ok());
        assert!(
            parse_artifact(&[
                "update",
                "--project",
                "p",
                "A1",
                "--path",
                "dist",
                "--base-version",
                "2"
            ])
            .is_ok()
        );
        assert!(parse_artifact(&["update", "--project", "p", "A1", "--path", "dist"]).is_err());
        assert!(
            parse_artifact(&["update", "--project", "p", "A1", "--base-version", "2"]).is_err()
        );
        assert!(
            parse_artifact(&[
                "update",
                "--project",
                "p",
                "A1",
                "--title",
                "T",
                "--path",
                "dist",
                "--base-version",
                "2"
            ])
            .is_ok()
        );
    }

    #[test]
    fn artifact_download_needs_an_output_directory_and_takes_an_optional_version() {
        assert!(parse_artifact(&["download", "--project", "p", "A1"]).is_err());
        let ArtifactSubcommand::Download { version, .. } = parse_artifact(&[
            "download",
            "--project",
            "p",
            "A1",
            "--out",
            "site",
            "--version",
            "3",
        ])
        .unwrap() else {
            panic!("expected download");
        };
        assert_eq!(version, Some(3));
        let ArtifactSubcommand::Download { version, .. } =
            parse_artifact(&["download", "--project", "p", "A1", "--out", "site"]).unwrap()
        else {
            panic!("expected download");
        };
        assert_eq!(version, None);
    }

    #[test]
    fn artifact_list_get_versions_archive_and_unarchive_parse() {
        let ArtifactSubcommand::List { archived, .. } =
            parse_artifact(&["list", "--project", "p", "--archived"]).unwrap()
        else {
            panic!("expected list");
        };
        assert!(archived);
        let ArtifactSubcommand::Get { files, .. } =
            parse_artifact(&["get", "--project", "p", "A1", "--files"]).unwrap()
        else {
            panic!("expected get");
        };
        assert!(files);
        for name in ["versions", "archive", "unarchive"] {
            assert!(
                parse_artifact(&[name, "--project", "p", "A1"]).is_ok(),
                "{name}"
            );
        }
    }

    #[test]
    fn artifact_commands_honour_the_global_json_flag() {
        let cli =
            Cli::try_parse_from(["tm", "--json", "artifact", "list", "--project", "p"]).unwrap();
        assert!(cli.json);
    }

    #[test]
    fn every_server_error_code_maps_to_the_documented_exit_code() {
        let fixture = crate::artifact::read_fixture("artifact-error-codes.json");
        let table = fixture["statusByCode"].as_object().unwrap();
        assert!(
            table.len() >= 25,
            "the fixture should list every server code"
        );
        for (code, status) in table {
            let status = status.as_u64().unwrap() as u16;
            let expected = match (status, code.as_str()) {
                (_, "BASE_VERSION_CONFLICT" | "PUBLISH_CONFLICT") => EXIT_CONFLICT,
                (403, _) => EXIT_AUTH,
                (404, _) => EXIT_NOT_FOUND,
                (400 | 413 | 415 | 422, _) => EXIT_INVALID_ARGUMENT,
                _ => EXIT_GENERAL,
            };
            assert_eq!(
                exit_code_for_api_error(status, code),
                expected,
                "{code} ({status})"
            );
        }
    }

    #[test]
    fn an_api_error_is_classified_by_its_code_not_by_its_message() {
        let error = CliError::Api {
            status: 500,
            code: "INTERNAL_ERROR".to_string(),
            message: "Idempotency-Key header is required".to_string(),
            retry_after_secs: None,
        };
        assert_eq!(exit_code_for_error(&error), EXIT_GENERAL);
        let conflict = CliError::Api {
            status: 409,
            code: "BASE_VERSION_CONFLICT".to_string(),
            message: "baseVersion 1 is not the latest version".to_string(),
            retry_after_secs: None,
        };
        assert_eq!(exit_code_for_error(&conflict), EXIT_CONFLICT);
    }
}
