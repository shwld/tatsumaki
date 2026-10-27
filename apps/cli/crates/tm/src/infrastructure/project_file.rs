use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{CliError, EXIT_CONFIG};

pub const PROJECT_FILE_NAME: &str = "tatsumaki.toml";
pub const PROJECT_ID_ENV: &str = "TATSUMAKI_PROJECT_ID";

/// Unknown keys are rejected so that a typo in the repository's committed
/// settings is not silently ignored.
#[derive(Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectFile {
    pub project_id: Option<String>,
}

pub fn find_project_file(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .map(|dir| dir.join(PROJECT_FILE_NAME))
        .find(|candidate| candidate.is_file())
}

pub fn read_project_file(path: &Path) -> Result<ProjectFile, CliError> {
    let raw = fs::read_to_string(path)?;
    toml::from_str(&raw).map_err(|e| CliError::Message(format!("Invalid {}: {e}", path.display())))
}

/// Resolution order: `--project` flag > `TATSUMAKI_PROJECT_ID` > `tatsumaki.toml`.
pub fn resolve_project_id(
    flag: Option<String>,
    env: Option<String>,
    cwd: &Path,
) -> Result<Option<String>, CliError> {
    let non_empty = |v: Option<String>| v.filter(|s| !s.trim().is_empty());
    if let Some(id) = non_empty(flag).or_else(|| non_empty(env)) {
        return Ok(Some(id));
    }
    match find_project_file(cwd) {
        Some(path) => Ok(non_empty(read_project_file(&path)?.project_id)),
        None => Ok(None),
    }
}

pub fn require_project(flag: Option<String>) -> Result<String, (CliError, i32)> {
    let cwd = std::env::current_dir().map_err(|e| (CliError::Io(e), EXIT_CONFIG))?;
    let env = std::env::var(PROJECT_ID_ENV).ok();
    resolve_project_id(flag, env, &cwd)
        .map_err(|e| (e, EXIT_CONFIG))?
        .ok_or_else(|| {
            (
                CliError::Message(format!(
                    "Project is not specified: pass --project, set {PROJECT_ID_ENV}, or add project_id to {PROJECT_FILE_NAME}"
                )),
                EXIT_CONFIG,
            )
        })
}

/// Like `require_project`, for commands where the project is optional.
pub fn optional_project(flag: Option<String>) -> Result<Option<String>, (CliError, i32)> {
    let cwd = std::env::current_dir().map_err(|e| (CliError::Io(e), EXIT_CONFIG))?;
    let env = std::env::var(PROJECT_ID_ENV).ok();
    resolve_project_id(flag, env, &cwd).map_err(|e| (e, EXIT_CONFIG))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_toml(dir: &Path, body: &str) {
        fs::write(dir.join(PROJECT_FILE_NAME), body).unwrap();
    }

    #[test]
    fn flag_wins_over_env_and_file() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_id = \"from-file\"");
        let id = resolve_project_id(Some("flag".into()), Some("env".into()), dir.path()).unwrap();
        assert_eq!(id.as_deref(), Some("flag"));
    }

    #[test]
    fn env_wins_over_file() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_id = \"from-file\"");
        let id = resolve_project_id(None, Some("env".into()), dir.path()).unwrap();
        assert_eq!(id.as_deref(), Some("env"));
    }

    #[test]
    fn file_is_found_in_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_id = \"from-file\"");
        let nested = dir.path().join("a").join("b");
        fs::create_dir_all(&nested).unwrap();
        let id = resolve_project_id(None, None, &nested).unwrap();
        assert_eq!(id.as_deref(), Some("from-file"));
    }

    #[test]
    fn nearest_file_wins() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_id = \"outer\"");
        let nested = dir.path().join("inner");
        fs::create_dir_all(&nested).unwrap();
        write_toml(&nested, "project_id = \"inner\"");
        let id = resolve_project_id(None, None, &nested).unwrap();
        assert_eq!(id.as_deref(), Some("inner"));
    }

    #[test]
    fn missing_everywhere_resolves_to_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(resolve_project_id(None, None, dir.path()).unwrap(), None);
    }

    #[test]
    fn invalid_toml_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_id = ");
        assert!(resolve_project_id(None, None, dir.path()).is_err());
    }

    #[test]
    fn unknown_keys_are_an_error() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_idd = \"x\"");
        assert!(resolve_project_id(None, None, dir.path()).is_err());
    }

    #[test]
    fn blank_values_are_ignored() {
        let dir = tempfile::tempdir().unwrap();
        write_toml(dir.path(), "project_id = \"from-file\"");
        let id = resolve_project_id(Some("".into()), Some(" ".into()), dir.path()).unwrap();
        assert_eq!(id.as_deref(), Some("from-file"));
    }
}
