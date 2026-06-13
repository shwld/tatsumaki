mod adapters;
mod application;
mod desktop_ipc_client;
mod desktop_ipc_command;
mod infrastructure;

use crate::application::ports::{
    StoryCommentInput, StoryCreateInput, StoryListFilter, StoryPointUpdate, StoryReorderInput,
    StoryUpdateInput, TokenStore,
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
use tabled::{Table, Tabled, settings::Style};
use url::Url;

pub const EXIT_GENERAL: i32 = 1;
pub const EXIT_INVALID_ARGUMENT: i32 = 2;
pub const EXIT_AUTH: i32 = 3;
pub const EXIT_NOT_FOUND: i32 = 4;
pub const EXIT_CONFIG: i32 = 5;
pub const EXIT_DESKTOP_IPC: i32 = 6;

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
    Project(ProjectCommand),
    Desktop(DesktopCommand),
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
    Get {
        #[arg(long)]
        project: String,
        story_number: i64,
    },
    List {
        #[arg(long)]
        project: String,
        #[arg(long, value_enum)]
        status: Option<StoryStatusArg>,
        #[arg(long, value_enum)]
        iteration: Option<IterationScopeArg>,
        #[arg(long)]
        limit: Option<u32>,
    },
    Create {
        #[arg(long)]
        project: String,
        #[arg(long)]
        title: String,
        #[arg(long = "type")]
        story_type: StoryTypeArg,
        #[arg(long)]
        description: String,
        #[arg(long, default_value_t = false)]
        is_icebox: bool,
    },
    Update {
        #[arg(long)]
        project: String,
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
    },
    Status {
        #[arg(long)]
        project: String,
        story_number: i64,
        #[arg(long, value_enum)]
        status: StoryStatusArg,
    },
    Comment {
        #[arg(long)]
        project: String,
        story_number: i64,
        #[arg(long)]
        body: String,
    },
    Reorder {
        #[arg(long)]
        project: String,
        #[arg(long = "ordered-id")]
        ordered_ids: Vec<String>,
    },
}

#[derive(Args, Debug)]
struct ProjectCommand {
    #[command(subcommand)]
    command: ProjectSubcommand,
}

#[derive(Subcommand, Debug)]
enum ProjectSubcommand {
    Get { project_id: String },
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
        Commands::Story(story_cmd) => {
            let base_url = resolve_base_url(&config_store, cli.base_url.clone())?;
            let service = build_service(base_url.clone());
            if let Some(warning) = service
                .check_version_compatibility(&base_url, env!("CARGO_PKG_VERSION"))
                .await
            {
                eprintln!("{warning}");
            }
            match story_cmd.command {
                StorySubcommand::Get {
                    project,
                    story_number,
                } => {
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
                    limit,
                } => {
                    let filter = StoryListFilter {
                        status: status.map(|s| s.as_api_str().to_string()),
                        iteration_date_scope: iteration.map(|i| i.as_api_str().to_string()),
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
                } => {
                    let input = StoryCreateInput {
                        title,
                        r#type: story_type.as_api_str().to_string(),
                        description,
                        is_icebox,
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
                } => {
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
                    let input = StoryUpdateInput {
                        title: None,
                        description: None,
                        r#type: None,
                        story_point: None,
                        status: Some(status.as_api_str().to_string()),
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
                StorySubcommand::Reorder {
                    project,
                    ordered_ids,
                } => {
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
        Commands::Project(project_cmd) => {
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
            println!("{}", config_store.show_raw().map_err(|e| (e, EXIT_CONFIG))?);
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
}
