use crate::desktop_ipc_client::{
    DESKTOP_IPC_TYPE_SCREEN, DESKTOP_IPC_TYPE_STORIES, DesktopIpcClient, DesktopIpcError,
};
use crate::{CliError, EXIT_DESKTOP_IPC};
use dirs::home_dir;
use rand::random;
use std::path::PathBuf;

pub enum DesktopRefetchKind {
    Stories,
    Screen,
}

impl DesktopRefetchKind {
    pub fn as_ipc_type(&self) -> &'static str {
        match self {
            Self::Stories => DESKTOP_IPC_TYPE_STORIES,
            Self::Screen => DESKTOP_IPC_TYPE_SCREEN,
        }
    }
}

pub async fn execute_refetch(
    project: Option<String>,
    refetch_kind: DesktopRefetchKind,
    timeout_ms: u64,
) -> Result<(String, &'static str, Option<String>), (CliError, i32)> {
    let endpoint = resolve_desktop_ipc_endpoint();
    let auth_token = resolve_desktop_ipc_auth_token();
    let client = DesktopIpcClient::new(endpoint, auth_token, timeout_ms)
        .map_err(desktop_ipc_to_cli_error)?;
    let request_id = format!("req-{:016x}", random::<u64>());
    let ipc_type = refetch_kind.as_ipc_type();
    client
        .send_refetch(&request_id, ipc_type, project.as_deref())
        .await
        .map_err(desktop_ipc_to_cli_error)?;
    Ok((request_id, ipc_type, project))
}

fn desktop_ipc_to_cli_error(error: DesktopIpcError) -> (CliError, i32) {
    match error {
        DesktopIpcError::DesktopNotRunning(message) => {
            (CliError::Message(message), EXIT_DESKTOP_IPC)
        }
        DesktopIpcError::Timeout(message) => (
            CliError::Message(format!(
                "desktop IPC timeout after {message}ms. please retry."
            )),
            EXIT_DESKTOP_IPC,
        ),
        DesktopIpcError::ProtocolMismatch(message) => {
            (CliError::Message(message), EXIT_DESKTOP_IPC)
        }
        DesktopIpcError::Unauthorized(message) => (CliError::Message(message), EXIT_DESKTOP_IPC),
        DesktopIpcError::RequestRejected(message) => (CliError::Message(message), EXIT_DESKTOP_IPC),
        DesktopIpcError::MissingEndpoint => (
            CliError::Message("desktop IPC endpoint is not configured".to_string()),
            EXIT_DESKTOP_IPC,
        ),
        DesktopIpcError::MissingAuthToken => (
            CliError::Message("desktop IPC auth token is not configured".to_string()),
            EXIT_DESKTOP_IPC,
        ),
        DesktopIpcError::Io(error) => (CliError::Io(error), EXIT_DESKTOP_IPC),
        DesktopIpcError::Json(error) => (CliError::Json(error), EXIT_DESKTOP_IPC),
    }
}

fn resolve_desktop_ipc_endpoint() -> String {
    if let Some(override_endpoint) = std::env::var("TATSUMAKI_DESKTOP_IPC_ENDPOINT")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        return override_endpoint;
    }

    for path in desktop_config_candidates() {
        if let Some(endpoint) = read_desktop_config_field(&path, "desktopIpcEndpoint") {
            return endpoint;
        }
    }

    if cfg!(windows) {
        let user = std::env::var("USERNAME")
            .ok()
            .or_else(|| std::env::var("USER").ok())
            .unwrap_or_else(|| "default".to_string());
        return format!("\\\\.\\pipe\\tatsumaki-desktop-{user}");
    }

    let runtime_dir = std::env::var("XDG_RUNTIME_DIR")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| {
            let base = home_dir().unwrap_or_else(|| PathBuf::from("."));
            if cfg!(target_os = "macos") {
                base.join("Library/Application Support/tatsumaki-desktop")
                    .to_string_lossy()
                    .to_string()
            } else {
                base.join(".config/tatsumaki-desktop")
                    .to_string_lossy()
                    .to_string()
            }
        });
    format!("{runtime_dir}/tatsumaki-desktop-ipc.sock")
}

fn resolve_desktop_ipc_auth_token() -> String {
    if let Some(override_token) = std::env::var("TATSUMAKI_DESKTOP_IPC_AUTH_TOKEN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        return override_token;
    }

    for path in desktop_config_candidates() {
        if let Some(token) = read_desktop_config_field(&path, "desktopIpcAuthToken") {
            return token;
        }
    }
    String::new()
}

fn read_desktop_config_field(path: &PathBuf, key: &str) -> Option<String> {
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

fn desktop_config_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = home_dir() {
        candidates
            .push(home.join("Library/Application Support/tatsumaki-desktop/desktop-config.json"));
        candidates.push(home.join(".config/tatsumaki-desktop/desktop-config.json"));
        candidates.push(home.join("AppData/Roaming/tatsumaki-desktop/desktop-config.json"));
    }
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refetch_kind_mapping() {
        assert_eq!(
            DesktopRefetchKind::Stories.as_ipc_type(),
            DESKTOP_IPC_TYPE_STORIES
        );
        assert_eq!(
            DesktopRefetchKind::Screen.as_ipc_type(),
            DESKTOP_IPC_TYPE_SCREEN
        );
    }
}
