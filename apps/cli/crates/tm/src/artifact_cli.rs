use std::path::PathBuf;

use clap::{Args, Subcommand};
use serde::Serialize;
use tabled::{Table, Tabled, settings::Style};

use crate::{
    CliError, EXIT_GENERAL, EXIT_INVALID_ARGUMENT,
    adapters::artifact_gateway::HttpArtifactGateway,
    application::{
        artifact_flow::{ArtifactFlow, FlowError, PublishRequest, RetryPolicy, TokenProvider},
        ports::{ArtifactInfo, ArtifactVersionInfo},
    },
    artifact::scan::scan_directory,
    infrastructure::project_file::require_project,
};

#[derive(Args, Debug)]
pub struct ArtifactCommand {
    #[command(subcommand)]
    pub command: ArtifactSubcommand,
}

#[derive(Subcommand, Debug)]
pub enum ArtifactSubcommand {
    /// Upload a built directory as a new artifact
    Create {
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        title: String,
        /// Directory that contains tatsumaki-artifact.json
        #[arg(long)]
        path: PathBuf,
    },
    /// Show an artifact and its latest version
    Get {
        #[arg(long)]
        project: Option<String>,
        artifact_id: String,
        /// Also list the files of the latest version
        #[arg(long)]
        files: bool,
    },
    /// List the artifacts of a project
    List {
        #[arg(long)]
        project: Option<String>,
        /// List archived artifacts instead of active ones
        #[arg(long)]
        archived: bool,
    },
    /// Change the title and/or publish a new version from a directory
    Update {
        #[arg(long)]
        project: Option<String>,
        artifact_id: String,
        #[arg(long)]
        title: Option<String>,
        /// Directory that contains tatsumaki-artifact.json
        #[arg(long, requires = "base_version")]
        path: Option<PathBuf>,
        /// The version this directory was built from; a newer latest is a conflict
        #[arg(long, requires = "path")]
        base_version: Option<i64>,
    },
    /// List the versions of an artifact
    Versions {
        #[arg(long)]
        project: Option<String>,
        artifact_id: String,
    },
    /// Download a version into a new or empty directory
    Download {
        #[arg(long)]
        project: Option<String>,
        artifact_id: String,
        /// Defaults to the latest version
        #[arg(long)]
        version: Option<i64>,
        /// Directory to write to; it must not exist or must be empty
        #[arg(long)]
        out: PathBuf,
    },
    /// Remove an artifact from the default list (its versions are kept)
    Archive {
        #[arg(long)]
        project: Option<String>,
        artifact_id: String,
    },
    /// Bring an archived artifact back into the default list
    Unarchive {
        #[arg(long)]
        project: Option<String>,
        artifact_id: String,
    },
}

pub fn latest_url(base_url: &str, project: &str, artifact_id: &str) -> String {
    format!(
        "{}/projects/{}/artifacts/{}",
        base_url.trim_end_matches('/'),
        urlencoding::encode(project),
        urlencoding::encode(artifact_id)
    )
}

pub fn version_url(base_url: &str, project: &str, artifact_id: &str, version: i64) -> String {
    format!(
        "{}/versions/{version}",
        latest_url(base_url, project, artifact_id)
    )
}

/// The output types are the CLI's own so that `--json` does not change when
/// the server adds a field.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactOutput {
    #[serde(flatten)]
    info: ArtifactInfo,
    latest_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionOutput {
    #[serde(flatten)]
    info: ArtifactVersionInfo,
    version_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishOutput {
    artifact_id: String,
    version: i64,
    noop: bool,
    latest_url: String,
    version_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateOutput {
    artifact_id: String,
    latest_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    noop: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    /// False only when a new version was published but the title change failed.
    title_updated: bool,
}

#[derive(Tabled)]
struct ArtifactRow {
    id: String,
    title: String,
    #[tabled(rename = "version")]
    version: String,
    updated: String,
}

#[derive(Tabled)]
struct VersionRow {
    version: i64,
    files: i64,
    bytes: i64,
    #[tabled(rename = "created by")]
    created_by: String,
    created: String,
    digest: String,
}

fn print_json<T: Serialize>(value: &T) -> Result<(), FlowError> {
    println!(
        "{}",
        serde_json::to_string_pretty(value).map_err(|e| (CliError::Json(e), EXIT_GENERAL))?
    );
    Ok(())
}

fn invalid(message: impl Into<String>) -> FlowError {
    (CliError::Message(message.into()), EXIT_INVALID_ARGUMENT)
}

/// The same limits the server applies to a title.
pub fn validate_title(title: &str) -> Result<String, String> {
    let trimmed = title.trim();
    let length = trimmed.chars().count();
    if length == 0 || length > 200 || trimmed.chars().any(|c| c.is_control()) {
        return Err("title must be 1-200 characters without control characters".to_string());
    }
    Ok(trimmed.to_string())
}

/// Progress goes to stderr and only in text mode, so `--json` stays parseable.
fn announce_upload(scan: &crate::artifact::scan::ScanResult, json: bool) {
    if !json {
        eprintln!(
            "Uploading {} files ({} bytes)...",
            scan.files.len(),
            scan.total_bytes
        );
    }
}

fn artifact_output(base_url: &str, info: ArtifactInfo) -> ArtifactOutput {
    ArtifactOutput {
        latest_url: latest_url(base_url, &info.project_id, &info.id),
        info,
    }
}

fn print_published(
    base_url: &str,
    project: &str,
    output: &crate::application::artifact_flow::PublishOutput,
    json: bool,
) -> Result<(), FlowError> {
    let result = PublishOutput {
        artifact_id: output.artifact_id.clone(),
        version: output.version,
        noop: output.noop,
        latest_url: latest_url(base_url, project, &output.artifact_id),
        version_url: version_url(base_url, project, &output.artifact_id, output.version),
    };
    if json {
        return print_json(&result);
    }
    println!("artifact: {}", result.artifact_id);
    if result.noop {
        println!(
            "version: {} (unchanged, nothing was uploaded)",
            result.version
        );
    } else {
        println!("version: {}", result.version);
    }
    println!("latest: {}", result.latest_url);
    println!("version url: {}", result.version_url);
    Ok(())
}

pub async fn run_artifact<T: TokenProvider + Sync>(
    command: ArtifactCommand,
    base_url: &str,
    tokens: &T,
    json: bool,
) -> Result<(), FlowError> {
    let gateway = HttpArtifactGateway::new(base_url.to_string());
    let flow = ArtifactFlow {
        gateway: &gateway,
        tokens,
        base_url: base_url.to_string(),
        retry: RetryPolicy::standard(),
    };

    match command.command {
        ArtifactSubcommand::Create {
            project,
            title,
            path,
        } => {
            let project = require_project(project)?;
            let title = validate_title(&title).map_err(invalid)?;
            let scan = scan_directory(&path).map_err(|e| invalid(e.to_string()))?;
            announce_upload(&scan, json);
            let output = flow
                .publish(&PublishRequest {
                    project: &project,
                    artifact_id: None,
                    base_version: None,
                    title: Some(&title),
                    scan: &scan,
                })
                .await?;
            print_published(base_url, &project, &output, json)
        }
        ArtifactSubcommand::Get {
            project,
            artifact_id,
            files,
        } => {
            let project = require_project(project)?;
            let detail = flow.get_artifact(&project, &artifact_id).await?;
            let artifact = artifact_output(base_url, detail.artifact);
            let latest = detail.latest_version.map(|latest| {
                let url = version_url(
                    base_url,
                    &project,
                    &artifact.info.id,
                    latest.version.version,
                );
                (
                    VersionOutput {
                        info: latest.version,
                        version_url: url,
                    },
                    latest.files,
                )
            });
            if json {
                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct GetOutput {
                    artifact: ArtifactOutput,
                    latest_version: Option<VersionOutput>,
                    #[serde(skip_serializing_if = "Option::is_none")]
                    files: Option<Vec<crate::application::ports::ArtifactFileInfo>>,
                }
                let (latest_version, listed) = match latest {
                    Some((version, list)) => (Some(version), files.then_some(list)),
                    None => (None, None),
                };
                return print_json(&GetOutput {
                    artifact,
                    latest_version,
                    files: listed,
                });
            }
            println!("id: {}", artifact.info.id);
            println!("title: {}", artifact.info.title);
            if artifact.info.archived_at.is_some() {
                println!("archived: yes");
            }
            println!("latest: {}", artifact.latest_url);
            if let Some((version, list)) = latest {
                println!(
                    "version: {} ({} files, {} bytes)",
                    version.info.version, version.info.file_count, version.info.total_bytes
                );
                println!("entrypoint: {}", version.info.entrypoint);
                println!("version url: {}", version.version_url);
                if files {
                    for file in list {
                        println!("  {} ({} bytes)", file.path, file.size);
                    }
                }
            }
            Ok(())
        }
        ArtifactSubcommand::List { project, archived } => {
            let project = require_project(project)?;
            let artifacts = flow.list_artifacts(&project, archived).await?;
            if json {
                #[derive(Serialize)]
                struct ListOutput {
                    artifacts: Vec<ArtifactOutput>,
                }
                return print_json(&ListOutput {
                    artifacts: artifacts
                        .into_iter()
                        .map(|a| artifact_output(base_url, a))
                        .collect(),
                });
            }
            let rows: Vec<ArtifactRow> = artifacts
                .into_iter()
                .map(|a| ArtifactRow {
                    id: a.id,
                    title: a.title,
                    version: a
                        .latest_version
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "-".into()),
                    updated: a.updated_at,
                })
                .collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            Ok(())
        }
        ArtifactSubcommand::Update {
            project,
            artifact_id,
            title,
            path,
            base_version,
        } => {
            let project = require_project(project)?;
            if title.is_none() && path.is_none() {
                return Err(invalid("give --title, --path with --base-version, or both"));
            }
            let title = title
                .as_deref()
                .map(validate_title)
                .transpose()
                .map_err(invalid)?;
            let mut result = UpdateOutput {
                artifact_id: artifact_id.clone(),
                latest_url: latest_url(base_url, &project, &artifact_id),
                version: None,
                version_url: None,
                noop: None,
                title: None,
                title_updated: true,
            };

            // Publish first: it is the step that can fail on a conflict, and
            // a failed upload must not leave a renamed artifact behind.
            if let (Some(path), Some(base_version)) = (&path, base_version) {
                let scan = scan_directory(path).map_err(|e| invalid(e.to_string()))?;
                announce_upload(&scan, json);
                let published = flow
                    .publish(&PublishRequest {
                        project: &project,
                        artifact_id: Some(&artifact_id),
                        base_version: Some(base_version),
                        title: None,
                        scan: &scan,
                    })
                    .await?;
                result.version = Some(published.version);
                result.noop = Some(published.noop);
                result.version_url = Some(version_url(
                    base_url,
                    &project,
                    &artifact_id,
                    published.version,
                ));
            }

            if let Some(title) = &title {
                match flow.update_title(&project, &artifact_id, title).await {
                    Ok(info) => result.title = Some(info.title),
                    Err(error) => {
                        result.title_updated = false;
                        if result.version.is_some() {
                            print_update(&result, json)?;
                            eprintln!(
                                "The new version was published but the title could not be changed. Run again with only --title to retry."
                            );
                        }
                        return Err(error);
                    }
                }
            }
            print_update(&result, json)
        }
        ArtifactSubcommand::Versions {
            project,
            artifact_id,
        } => {
            let project = require_project(project)?;
            let versions = flow.list_versions(&project, &artifact_id).await?;
            if json {
                #[derive(Serialize)]
                struct VersionsOutput {
                    versions: Vec<VersionOutput>,
                }
                return print_json(&VersionsOutput {
                    versions: versions
                        .into_iter()
                        .map(|v| VersionOutput {
                            version_url: version_url(base_url, &project, &artifact_id, v.version),
                            info: v,
                        })
                        .collect(),
                });
            }
            let rows: Vec<VersionRow> = versions
                .into_iter()
                .map(|v| VersionRow {
                    version: v.version,
                    files: v.file_count,
                    bytes: v.total_bytes,
                    created_by: v.created_by,
                    created: v.created_at,
                    digest: v.tree_digest.chars().take(12).collect(),
                })
                .collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            Ok(())
        }
        ArtifactSubcommand::Download {
            project,
            artifact_id,
            version,
            out,
        } => {
            let project = require_project(project)?;
            let downloaded = flow.download(&project, &artifact_id, version, &out).await?;
            if json {
                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct DownloadOutput {
                    artifact_id: String,
                    version: i64,
                    out_dir: String,
                    file_count: usize,
                    total_bytes: u64,
                }
                return print_json(&DownloadOutput {
                    artifact_id: downloaded.artifact_id,
                    version: downloaded.version,
                    out_dir: out.display().to_string(),
                    file_count: downloaded.file_count,
                    total_bytes: downloaded.total_bytes,
                });
            }
            println!(
                "Downloaded version {} ({} files, {} bytes) to {}",
                downloaded.version,
                downloaded.file_count,
                downloaded.total_bytes,
                out.display()
            );
            Ok(())
        }
        ArtifactSubcommand::Archive {
            project,
            artifact_id,
        } => {
            let project = require_project(project)?;
            let info = flow.set_archived(&project, &artifact_id, true).await?;
            print_artifact(base_url, info, json)
        }
        ArtifactSubcommand::Unarchive {
            project,
            artifact_id,
        } => {
            let project = require_project(project)?;
            let info = flow.set_archived(&project, &artifact_id, false).await?;
            print_artifact(base_url, info, json)
        }
    }
}

fn print_update(result: &UpdateOutput, json: bool) -> Result<(), FlowError> {
    if json {
        return print_json(result);
    }
    println!("artifact: {}", result.artifact_id);
    if let Some(version) = result.version {
        if result.noop == Some(true) {
            println!("version: {version} (unchanged, nothing was uploaded)");
        } else {
            println!("version: {version}");
        }
    }
    if let Some(title) = &result.title {
        println!("title: {title}");
    }
    println!("latest: {}", result.latest_url);
    if let Some(url) = &result.version_url {
        println!("version url: {url}");
    }
    Ok(())
}

fn print_artifact(base_url: &str, info: ArtifactInfo, json: bool) -> Result<(), FlowError> {
    let output = artifact_output(base_url, info);
    if json {
        return print_json(&output);
    }
    println!("id: {}", output.info.id);
    println!("title: {}", output.info.title);
    println!(
        "archived: {}",
        if output.info.archived_at.is_some() {
            "yes"
        } else {
            "no"
        }
    );
    println!("latest: {}", output.latest_url);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_web_urls() {
        assert_eq!(
            latest_url("https://tm.example/", "P1", "A1"),
            "https://tm.example/projects/P1/artifacts/A1"
        );
        assert_eq!(
            version_url("https://tm.example", "P1", "A1", 3),
            "https://tm.example/projects/P1/artifacts/A1/versions/3"
        );
    }

    #[test]
    fn titles_follow_the_server_rules() {
        assert_eq!(validate_title("  Demo  "), Ok("Demo".to_string()));
        assert!(validate_title("   ").is_err());
        assert!(validate_title(&"a".repeat(201)).is_err());
        assert!(validate_title(&"a".repeat(200)).is_ok());
        assert!(validate_title("tab\there").is_err());
    }
}
