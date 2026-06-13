use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::{Duration, timeout};

pub const DESKTOP_IPC_PROTOCOL_VERSION: i32 = 1;
pub const DEFAULT_IPC_TIMEOUT_MS: u64 = 3000;

pub const DESKTOP_IPC_TYPE_STORIES: &str = "refetch:stories";
pub const DESKTOP_IPC_TYPE_SCREEN: &str = "refetch:screen";

#[derive(Debug, thiserror::Error)]
pub enum DesktopIpcError {
    #[error("desktop is not running (cannot connect to IPC endpoint: {0})")]
    DesktopNotRunning(String),
    #[error("desktop IPC request timed out after {0}ms. please retry.")]
    Timeout(u64),
    #[error("desktop IPC protocol mismatch: {0}")]
    ProtocolMismatch(String),
    #[error("desktop IPC authentication failed: {0}")]
    Unauthorized(String),
    #[error("desktop IPC rejected request: {0}")]
    RequestRejected(String),
    #[error("desktop IPC endpoint is not configured")]
    MissingEndpoint,
    #[error("desktop IPC auth token is not configured")]
    MissingAuthToken,
    #[error("desktop IPC failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("desktop IPC payload error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Serialize)]
struct DesktopIpcRequest<'a> {
    version: i32,
    #[serde(rename = "requestId")]
    request_id: &'a str,
    #[serde(rename = "authToken")]
    auth_token: &'a str,
    #[serde(rename = "type")]
    message_type: &'a str,
    payload: DesktopIpcPayload<'a>,
}

#[derive(Debug, Serialize)]
struct DesktopIpcPayload<'a> {
    #[serde(rename = "projectId")]
    project_id: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
struct DesktopIpcResponse {
    #[serde(rename = "requestId")]
    request_id: String,
    ok: bool,
    #[serde(rename = "errorCode")]
    error_code: Option<String>,
    message: Option<String>,
}

pub struct DesktopIpcClient {
    endpoint: String,
    auth_token: String,
    timeout_ms: u64,
}

impl DesktopIpcClient {
    pub fn new(
        endpoint: String,
        auth_token: String,
        timeout_ms: u64,
    ) -> Result<Self, DesktopIpcError> {
        if endpoint.trim().is_empty() {
            return Err(DesktopIpcError::MissingEndpoint);
        }
        if auth_token.trim().is_empty() {
            return Err(DesktopIpcError::MissingAuthToken);
        }
        Ok(Self {
            endpoint,
            auth_token,
            timeout_ms,
        })
    }

    pub async fn send_refetch(
        &self,
        request_id: &str,
        message_type: &str,
        project_id: Option<&str>,
    ) -> Result<(), DesktopIpcError> {
        let request = DesktopIpcRequest {
            version: DESKTOP_IPC_PROTOCOL_VERSION,
            request_id,
            auth_token: self.auth_token.as_str(),
            message_type,
            payload: DesktopIpcPayload { project_id },
        };
        let line = format!("{}\\n", serde_json::to_string(&request)?);
        let response_line = timeout(self.timeout(), self.send_and_read_line(line))
            .await
            .map_err(|_| DesktopIpcError::Timeout(self.timeout_ms))??;
        let response: DesktopIpcResponse = serde_json::from_str(response_line.trim())?;
        if response.request_id != request_id {
            return Err(DesktopIpcError::RequestRejected(
                "requestId mismatch in IPC response".to_string(),
            ));
        }
        if response.ok {
            return Ok(());
        }

        let error_code = response.error_code.unwrap_or_else(|| "UNKNOWN".to_string());
        let message = response
            .message
            .unwrap_or_else(|| "desktop IPC request failed".to_string());
        if error_code == "PROTOCOL_VERSION_MISMATCH" {
            return Err(DesktopIpcError::ProtocolMismatch(message));
        }
        if error_code == "UNAUTHORIZED" {
            return Err(DesktopIpcError::Unauthorized(message));
        }
        Err(DesktopIpcError::RequestRejected(message))
    }

    fn timeout(&self) -> Duration {
        Duration::from_millis(self.timeout_ms)
    }

    async fn send_and_read_line(&self, request: String) -> Result<String, DesktopIpcError> {
        #[cfg(unix)]
        {
            use tokio::net::UnixStream;
            let mut stream = UnixStream::connect(self.endpoint.as_str())
                .await
                .map_err(|_| DesktopIpcError::DesktopNotRunning(self.endpoint.clone()))?;
            stream.write_all(request.as_bytes()).await?;
            stream.flush().await?;
            let mut buf = vec![0_u8; 4096];
            let read = stream.read(&mut buf).await?;
            return Ok(String::from_utf8_lossy(&buf[..read]).to_string());
        }
        #[cfg(windows)]
        {
            use tokio::net::windows::named_pipe::ClientOptions;
            let mut stream = ClientOptions::new()
                .open(self.endpoint.as_str())
                .map_err(|_| DesktopIpcError::DesktopNotRunning(self.endpoint.clone()))?;
            stream.write_all(request.as_bytes()).await?;
            stream.flush().await?;
            let mut buf = vec![0_u8; 4096];
            let read = stream.read(&mut buf).await?;
            return Ok(String::from_utf8_lossy(&buf[..read]).to_string());
        }
        #[allow(unreachable_code)]
        Err(DesktopIpcError::Io(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "unsupported platform for desktop IPC",
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_rejects_empty_endpoint() {
        let result = DesktopIpcClient::new(" ".to_string(), "token".to_string(), 1000);
        assert!(matches!(result, Err(DesktopIpcError::MissingEndpoint)));
    }

    #[test]
    fn client_rejects_empty_auth_token() {
        let result = DesktopIpcClient::new("/tmp/sock".to_string(), "".to_string(), 1000);
        assert!(matches!(result, Err(DesktopIpcError::MissingAuthToken)));
    }
}
