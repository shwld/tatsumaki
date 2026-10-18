use std::{future::Future, path::Path, pin::Pin, time::Duration};

use serde::Serialize;

use super::ports::{
    ArtifactGateway, ArtifactInfo, CreateUploadInput, CreateUploadOutcome, UploadFileEntry,
    UploadSession,
};
use crate::{
    CliError, EXIT_GENERAL, EXIT_INVALID_ARGUMENT,
    artifact::{
        digest::sha256_hex,
        download::{Staging, check_output_target, validate_download_plan, verify_file},
        scan::ScanResult,
    },
    exit_code_for_error, is_unauthorized,
};

pub type FlowError = (CliError, i32);

/// `gateway_call!(self, method(arg, ...))` runs `gateway.method(arg, ..., token)`
/// as a retryable call. The token is owned by the future so the borrowed
/// arguments can have any lifetime.
macro_rules! gateway_call {
    ($self:ident, $method:ident($($arg:expr),* $(,)?)) => {
        $self.call(|token| {
            let gateway = $self.gateway;
            Box::pin(async move { gateway.$method($($arg,)* &token).await })
        })
    };
}

/// Where access tokens come from. `CliService` implements it; tests use a fake.
#[async_trait::async_trait]
pub trait TokenProvider {
    async fn access_token(&self, base_url: &str) -> Result<String, FlowError>;
    async fn refresh_access_token(&self, base_url: &str) -> Result<String, FlowError>;
}

#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub base_delay: Duration,
}

impl RetryPolicy {
    pub fn standard() -> Self {
        Self {
            max_retries: 3,
            base_delay: Duration::from_millis(500),
        }
    }

    fn delay(&self, attempt: u32, retry_after_secs: Option<u64>) -> Duration {
        if let Some(seconds) = retry_after_secs {
            return Duration::from_secs(seconds.min(30));
        }
        let exponential = self.base_delay * 2u32.saturating_pow(attempt);
        let jitter_ms = if self.base_delay.is_zero() {
            0
        } else {
            rand::random::<u64>() % 100
        };
        exponential + Duration::from_millis(jitter_ms)
    }
}

/// Only failures that can go away by themselves are retried. Every operation
/// the flow retries is idempotent on the server.
fn is_retryable(error: &CliError) -> bool {
    match error {
        CliError::Api { status, .. } => *status == 429 || (500..=599).contains(status),
        CliError::Request(error) => error.is_connect() || error.is_timeout(),
        _ => false,
    }
}

/// A 401 from the artifact API is recognised by its status, not its text.
fn needs_token_refresh(error: &CliError) -> bool {
    matches!(error, CliError::Api { status: 401, .. }) || is_unauthorized(error)
}

fn retry_after(error: &CliError) -> Option<u64> {
    match error {
        CliError::Api {
            retry_after_secs, ..
        } => *retry_after_secs,
        _ => None,
    }
}

fn api_code(error: &CliError) -> Option<&str> {
    match error {
        CliError::Api { code, .. } => Some(code),
        _ => None,
    }
}

fn general(message: impl Into<String>) -> FlowError {
    (CliError::Message(message.into()), EXIT_GENERAL)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublishOutput {
    pub artifact_id: String,
    pub version: i64,
    pub noop: bool,
}

pub struct PublishRequest<'a> {
    pub project: &'a str,
    /// Set for an update, together with `base_version`.
    pub artifact_id: Option<&'a str>,
    pub base_version: Option<i64>,
    /// Required for a new artifact.
    pub title: Option<&'a str>,
    pub scan: &'a ScanResult,
}

#[derive(Debug, PartialEq)]
pub struct DownloadOutput {
    pub artifact_id: String,
    pub version: i64,
    pub file_count: usize,
    pub total_bytes: u64,
}

type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub struct ArtifactFlow<'a, G: ArtifactGateway, T: TokenProvider> {
    pub gateway: &'a G,
    pub tokens: &'a T,
    pub base_url: String,
    pub retry: RetryPolicy,
}

impl<G: ArtifactGateway + Sync, T: TokenProvider + Sync> ArtifactFlow<'_, G, T> {
    /// Runs one gateway call with the access token, refreshing it once on a
    /// 401 and retrying transient failures with backoff.
    async fn call<'a, R, F>(&'a self, op: F) -> Result<R, FlowError>
    where
        F: Fn(String) -> BoxFuture<'a, Result<R, CliError>>,
    {
        let mut token = self.tokens.access_token(&self.base_url).await?;
        let mut refreshed = false;
        let mut attempt = 0;
        loop {
            match op(token.clone()).await {
                Ok(value) => return Ok(value),
                Err(error) if needs_token_refresh(&error) && !refreshed => {
                    token = self.tokens.refresh_access_token(&self.base_url).await?;
                    refreshed = true;
                }
                Err(error) if is_retryable(&error) && attempt < self.retry.max_retries => {
                    tokio::time::sleep(self.retry.delay(attempt, retry_after(&error))).await;
                    attempt += 1;
                }
                Err(error) => {
                    let code = exit_code_for_error(&error);
                    return Err((error, code));
                }
            }
        }
    }

    pub async fn list_artifacts(
        &self,
        project: &str,
        archived: bool,
    ) -> Result<Vec<ArtifactInfo>, FlowError> {
        gateway_call!(self, list_artifacts(project, archived)).await
    }

    pub async fn get_artifact(
        &self,
        project: &str,
        artifact_id: &str,
    ) -> Result<super::ports::ArtifactDetailBody, FlowError> {
        gateway_call!(self, get_artifact(project, artifact_id)).await
    }

    pub async fn list_versions(
        &self,
        project: &str,
        artifact_id: &str,
    ) -> Result<Vec<super::ports::ArtifactVersionInfo>, FlowError> {
        gateway_call!(self, list_artifact_versions(project, artifact_id)).await
    }

    pub async fn get_version(
        &self,
        project: &str,
        artifact_id: &str,
        version: i64,
    ) -> Result<super::ports::ArtifactVersionFilesBody, FlowError> {
        gateway_call!(self, get_artifact_version(project, artifact_id, version)).await
    }

    pub async fn update_title(
        &self,
        project: &str,
        artifact_id: &str,
        title: &str,
    ) -> Result<ArtifactInfo, FlowError> {
        gateway_call!(self, update_artifact_title(project, artifact_id, title)).await
    }

    pub async fn set_archived(
        &self,
        project: &str,
        artifact_id: &str,
        archived: bool,
    ) -> Result<ArtifactInfo, FlowError> {
        gateway_call!(self, set_artifact_archived(project, artifact_id, archived)).await
    }

    /// Creates an upload session, sends the files the server does not have yet
    /// and finalizes. Recovery follows the server's error codes:
    /// - `SESSION_EXPIRED`: start over once with a new Idempotency-Key
    /// - finalize `UPLOAD_INCOMPLETE`: ask for the session again (same key) to
    ///   learn what is missing, send that, finalize once more
    /// - upload `SESSION_NOT_PENDING`: an earlier finalize may have succeeded,
    ///   so finalize to find out
    /// - `PUBLISH_CONFLICT` / `BASE_VERSION_CONFLICT`: never retried
    pub async fn publish(&self, request: &PublishRequest<'_>) -> Result<PublishOutput, FlowError> {
        let mut key = new_idempotency_key();
        match self.publish_with_key(request, &key).await {
            Err((error, _)) if api_code(&error) == Some("SESSION_EXPIRED") => {
                key = new_idempotency_key();
                self.publish_with_key(request, &key).await
            }
            other => other,
        }
    }

    async fn publish_with_key(
        &self,
        request: &PublishRequest<'_>,
        key: &str,
    ) -> Result<PublishOutput, FlowError> {
        let input = build_create_input(request);
        let outcome = self.create_session(request.project, &input, key).await?;
        let mut session = match outcome {
            CreateUploadOutcome::Noop {
                artifact_id,
                version,
            } => {
                return Ok(PublishOutput {
                    artifact_id,
                    version,
                    noop: true,
                });
            }
            CreateUploadOutcome::Session(session) => session,
        };

        for round in 0..2 {
            match session.status.as_str() {
                "published" => return self.finalize(request.project, &session.session_id).await,
                "expired" => {
                    return Err(api_error(
                        "SESSION_EXPIRED",
                        "The upload session has expired",
                        410,
                    ));
                }
                _ => {}
            }

            if !self.upload_missing(request, &session).await? {
                // The session was published by an earlier attempt of ours.
                return self.finalize(request.project, &session.session_id).await;
            }

            match self.finalize(request.project, &session.session_id).await {
                Err((error, _)) if round == 0 && api_code(&error) == Some("UPLOAD_INCOMPLETE") => {
                    let CreateUploadOutcome::Session(fresh) =
                        self.create_session(request.project, &input, key).await?
                    else {
                        return Err(general("The server answered unexpectedly while resuming"));
                    };
                    session = fresh;
                }
                other => return other,
            }
        }
        Err(general("The upload could not be completed"))
    }

    async fn create_session(
        &self,
        project: &str,
        input: &CreateUploadInput,
        key: &str,
    ) -> Result<CreateUploadOutcome, FlowError> {
        gateway_call!(self, create_upload(project, input, key)).await
    }

    async fn finalize(&self, project: &str, session_id: &str) -> Result<PublishOutput, FlowError> {
        let body = gateway_call!(self, finalize_upload(project, session_id)).await?;
        Ok(PublishOutput {
            artifact_id: body.artifact_id,
            version: body.version,
            noop: false,
        })
    }

    /// Sends every file the session does not have. Returns false when the
    /// server says the session is no longer pending.
    async fn upload_missing(
        &self,
        request: &PublishRequest<'_>,
        session: &UploadSession,
    ) -> Result<bool, FlowError> {
        for file in &request.scan.files {
            if session.uploaded_paths.contains(&file.path) {
                continue;
            }
            // Read once and send exactly the bytes that were hashed, so a file
            // that changed after the scan is caught here, not by the server.
            let bytes = std::fs::read(&file.source)
                .map_err(|e| general(format!("cannot read {}: {e}", file.path)))?;
            if bytes.len() as u64 != file.size || sha256_hex(&bytes) != file.sha256 {
                return Err((
                    CliError::Message(format!(
                        "{} changed after it was scanned; run the command again",
                        file.path
                    )),
                    EXIT_GENERAL,
                ));
            }
            let payload = &bytes;
            let sent = gateway_call!(
                self,
                put_upload_file(
                    request.project,
                    &session.session_id,
                    &file.path,
                    payload.clone()
                )
            )
            .await;
            match sent {
                Ok(()) => {}
                Err((error, _)) if api_code(&error) == Some("SESSION_NOT_PENDING") => {
                    return Ok(false);
                }
                Err(error) => return Err(error),
            }
        }
        Ok(true)
    }

    /// Downloads one version into `out`. The version is fixed up front, the
    /// server's manifest is validated before any file is fetched, every file is
    /// verified, and nothing is left behind unless the whole version is intact.
    pub async fn download(
        &self,
        project: &str,
        artifact_id: &str,
        version: Option<i64>,
        out: &Path,
    ) -> Result<DownloadOutput, FlowError> {
        let version = match version {
            Some(version) => version,
            None => self
                .get_artifact(project, artifact_id)
                .await?
                .artifact
                .latest_version
                .ok_or_else(|| general("The artifact has no versions"))?,
        };

        let detail = self.get_version(project, artifact_id, version).await?;
        validate_download_plan(&detail.files, &detail.version.tree_digest).map_err(|message| {
            (
                CliError::Message(format!("Invalid manifest from the server: {message}")),
                EXIT_GENERAL,
            )
        })?;
        let target = check_output_target(out)
            .map_err(|message| (CliError::Message(message), EXIT_INVALID_ARGUMENT))?;

        let staging = Staging::create_beside(out).map_err(general)?;
        for file in &detail.files {
            let bytes = gateway_call!(
                self,
                download_file(project, artifact_id, version, &file.path, file.size)
            )
            .await?;
            verify_file(file, &bytes).map_err(general)?;
            staging.write_file(&file.path, &bytes).map_err(general)?;
        }
        staging.commit(out, target).map_err(general)?;

        Ok(DownloadOutput {
            artifact_id: artifact_id.to_string(),
            version,
            file_count: detail.files.len(),
            total_bytes: detail.files.iter().map(|f| f.size).sum(),
        })
    }
}

fn build_create_input(request: &PublishRequest<'_>) -> CreateUploadInput {
    CreateUploadInput {
        artifact_id: request.artifact_id.map(str::to_string),
        title: if request.artifact_id.is_some() {
            None
        } else {
            request.title.map(str::to_string)
        },
        base_version: request.base_version,
        entrypoint: request.scan.entrypoint.clone(),
        tree_digest: request.scan.tree_digest.clone(),
        files: request
            .scan
            .files
            .iter()
            .map(|f| UploadFileEntry {
                path: f.path.clone(),
                size: f.size,
                sha256: f.sha256.clone(),
            })
            .collect(),
    }
}

fn new_idempotency_key() -> String {
    format!("tm-{:032x}", rand::random::<u128>())
}

fn api_error(code: &str, message: &str, status: u16) -> FlowError {
    let error = CliError::Api {
        status,
        code: code.to_string(),
        message: message.to_string(),
        retry_after_secs: None,
    };
    let exit = exit_code_for_error(&error);
    (error, exit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{
        ArtifactDetailBody, ArtifactFileInfo, ArtifactVersionFilesBody, ArtifactVersionInfo,
        FinalizeBody,
    };
    use crate::artifact::scan::scan_directory;
    use std::{collections::VecDeque, sync::Mutex};

    fn api(status: u16, code: &str) -> CliError {
        CliError::Api {
            status,
            code: code.to_string(),
            message: format!("{code} happened"),
            retry_after_secs: None,
        }
    }

    #[derive(Default)]
    struct Script {
        create: VecDeque<Result<CreateUploadOutcome, CliError>>,
        put: VecDeque<Result<(), CliError>>,
        finalize: VecDeque<Result<FinalizeBody, CliError>>,
        files: Vec<ArtifactFileInfo>,
        tree_digest: String,
        latest_version: Option<i64>,
        downloads: std::collections::HashMap<String, Vec<u8>>,
        calls: Vec<String>,
    }

    struct FakeGateway {
        script: Mutex<Script>,
    }

    impl FakeGateway {
        fn new(script: Script) -> Self {
            Self {
                script: Mutex::new(script),
            }
        }
        fn calls(&self) -> Vec<String> {
            self.script.lock().unwrap().calls.clone()
        }
    }

    #[async_trait::async_trait]
    impl ArtifactGateway for FakeGateway {
        async fn list_artifacts(
            &self,
            _: &str,
            _: bool,
            _: &str,
        ) -> Result<Vec<ArtifactInfo>, CliError> {
            Ok(vec![])
        }
        async fn get_artifact(
            &self,
            _: &str,
            id: &str,
            _: &str,
        ) -> Result<ArtifactDetailBody, CliError> {
            let script = self.script.lock().unwrap();
            Ok(ArtifactDetailBody {
                artifact: ArtifactInfo {
                    id: id.to_string(),
                    project_id: "p".into(),
                    title: "t".into(),
                    archived_at: None,
                    latest_version: script.latest_version,
                    created_by: "u".into(),
                    created_at: "c".into(),
                    updated_at: "u".into(),
                },
                latest_version: None,
            })
        }
        async fn update_artifact_title(
            &self,
            _: &str,
            _: &str,
            _: &str,
            _: &str,
        ) -> Result<ArtifactInfo, CliError> {
            unimplemented!()
        }
        async fn set_artifact_archived(
            &self,
            _: &str,
            _: &str,
            _: bool,
            _: &str,
        ) -> Result<ArtifactInfo, CliError> {
            unimplemented!()
        }
        async fn list_artifact_versions(
            &self,
            _: &str,
            _: &str,
            _: &str,
        ) -> Result<Vec<ArtifactVersionInfo>, CliError> {
            Ok(vec![])
        }
        async fn get_artifact_version(
            &self,
            _: &str,
            _: &str,
            version: i64,
            token: &str,
        ) -> Result<ArtifactVersionFilesBody, CliError> {
            let mut script = self.script.lock().unwrap();
            script.calls.push(format!("get_version {version} {token}"));
            Ok(ArtifactVersionFilesBody {
                version: ArtifactVersionInfo {
                    version,
                    entrypoint: "index.html".into(),
                    tree_digest: script.tree_digest.clone(),
                    file_count: script.files.len() as i64,
                    total_bytes: 0,
                    created_by: "u".into(),
                    created_at: "c".into(),
                },
                files: script.files.clone(),
            })
        }
        async fn create_upload(
            &self,
            _: &str,
            _: &CreateUploadInput,
            key: &str,
            token: &str,
        ) -> Result<CreateUploadOutcome, CliError> {
            let mut script = self.script.lock().unwrap();
            script.calls.push(format!("create {key} {token}"));
            script.create.pop_front().expect("unexpected create")
        }
        async fn put_upload_file(
            &self,
            _: &str,
            _: &str,
            path: &str,
            bytes: Vec<u8>,
            token: &str,
        ) -> Result<(), CliError> {
            let mut script = self.script.lock().unwrap();
            script
                .calls
                .push(format!("put {path} {} {token}", bytes.len()));
            script.put.pop_front().unwrap_or(Ok(()))
        }
        async fn finalize_upload(
            &self,
            _: &str,
            session_id: &str,
            token: &str,
        ) -> Result<FinalizeBody, CliError> {
            let mut script = self.script.lock().unwrap();
            script.calls.push(format!("finalize {session_id} {token}"));
            script.finalize.pop_front().expect("unexpected finalize")
        }
        async fn download_file(
            &self,
            _: &str,
            _: &str,
            _: i64,
            path: &str,
            _: u64,
            _: &str,
        ) -> Result<Vec<u8>, CliError> {
            let script = self.script.lock().unwrap();
            script
                .downloads
                .get(path)
                .cloned()
                .ok_or_else(|| api(404, "FILE_NOT_FOUND"))
        }
    }

    struct FakeTokens {
        refreshed: Mutex<u32>,
    }

    #[async_trait::async_trait]
    impl TokenProvider for FakeTokens {
        async fn access_token(&self, _: &str) -> Result<String, FlowError> {
            Ok("old".to_string())
        }
        async fn refresh_access_token(&self, _: &str) -> Result<String, FlowError> {
            *self.refreshed.lock().unwrap() += 1;
            Ok("new".to_string())
        }
    }

    fn session(status: &str, uploaded: &[&str]) -> CreateUploadOutcome {
        CreateUploadOutcome::Session(UploadSession {
            session_id: "S1".into(),
            artifact_id: "A1".into(),
            status: status.into(),
            uploaded_paths: uploaded.iter().map(|p| p.to_string()).collect(),
        })
    }

    fn done(version: i64) -> Result<FinalizeBody, CliError> {
        Ok(FinalizeBody {
            artifact_id: "A1".into(),
            version,
        })
    }

    fn site() -> (tempfile::TempDir, ScanResult) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("tatsumaki-artifact.json"),
            br#"{"schemaVersion":1,"entrypoint":"index.html"}"#,
        )
        .unwrap();
        std::fs::write(dir.path().join("index.html"), b"<html>").unwrap();
        std::fs::create_dir_all(dir.path().join("assets")).unwrap();
        std::fs::write(dir.path().join("assets/app.js"), b"console.log(1)").unwrap();
        let scan = scan_directory(dir.path()).unwrap();
        (dir, scan)
    }

    fn flow<'a>(
        gateway: &'a FakeGateway,
        tokens: &'a FakeTokens,
    ) -> ArtifactFlow<'a, FakeGateway, FakeTokens> {
        ArtifactFlow {
            gateway,
            tokens,
            base_url: "https://tm.example".into(),
            retry: RetryPolicy {
                max_retries: 3,
                base_delay: Duration::ZERO,
            },
        }
    }

    fn tokens() -> FakeTokens {
        FakeTokens {
            refreshed: Mutex::new(0),
        }
    }

    fn new_request<'a>(scan: &'a ScanResult) -> PublishRequest<'a> {
        PublishRequest {
            project: "p",
            artifact_id: None,
            base_version: None,
            title: Some("Demo"),
            scan,
        }
    }

    fn put_calls(calls: &[String]) -> Vec<&String> {
        calls.iter().filter(|c| c.starts_with("put ")).collect()
    }

    #[tokio::test]
    async fn publishes_every_file_then_finalizes() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &[]))]),
            finalize: VecDeque::from([done(1)]),
            ..Script::default()
        });
        let tokens = tokens();

        let output = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        assert_eq!(
            output,
            PublishOutput {
                artifact_id: "A1".into(),
                version: 1,
                noop: false
            }
        );
        let calls = gateway.calls();
        assert_eq!(put_calls(&calls).len(), scan.files.len());
        assert!(calls.last().unwrap().starts_with("finalize S1"));
    }

    #[tokio::test]
    async fn reports_a_noop_without_uploading() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(CreateUploadOutcome::Noop {
                artifact_id: "A1".into(),
                version: 4,
            })]),
            ..Script::default()
        });
        let tokens = tokens();
        let request = PublishRequest {
            artifact_id: Some("A1"),
            base_version: Some(4),
            title: None,
            ..new_request(&scan)
        };

        let output = flow(&gateway, &tokens).publish(&request).await.unwrap();

        assert_eq!(
            output,
            PublishOutput {
                artifact_id: "A1".into(),
                version: 4,
                noop: true
            }
        );
        assert!(put_calls(&gateway.calls()).is_empty());
    }

    #[tokio::test]
    async fn skips_files_the_server_already_has() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &["assets/app.js", "index.html"]))]),
            finalize: VecDeque::from([done(1)]),
            ..Script::default()
        });
        let tokens = tokens();

        flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        let calls = gateway.calls();
        let puts = put_calls(&calls);
        assert_eq!(puts.len(), 1);
        assert!(puts[0].starts_with("put tatsumaki-artifact.json"));
    }

    #[tokio::test]
    async fn asks_again_and_sends_what_is_missing_when_finalize_is_incomplete() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([
                Ok(session("pending", &[])),
                Ok(session("pending", &["assets/app.js", "index.html"])),
            ]),
            finalize: VecDeque::from([Err(api(409, "UPLOAD_INCOMPLETE")), done(2)]),
            ..Script::default()
        });
        let tokens = tokens();

        let output = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        assert_eq!(output.version, 2);
        let calls = gateway.calls();
        let creates: Vec<&String> = calls.iter().filter(|c| c.starts_with("create ")).collect();
        assert_eq!(creates.len(), 2);
        // the second create reuses the Idempotency-Key
        assert_eq!(creates[0].split(' ').nth(1), creates[1].split(' ').nth(1));
    }

    #[tokio::test]
    async fn gives_up_after_one_more_incomplete_finalize() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &[])), Ok(session("pending", &[]))]),
            finalize: VecDeque::from([
                Err(api(409, "UPLOAD_INCOMPLETE")),
                Err(api(409, "UPLOAD_INCOMPLETE")),
            ]),
            ..Script::default()
        });
        let tokens = tokens();

        let error = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap_err();

        assert_eq!(api_code(&error.0), Some("UPLOAD_INCOMPLETE"));
    }

    #[tokio::test]
    async fn starts_over_once_with_a_new_key_when_the_session_expired() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("expired", &[])), Ok(session("pending", &[]))]),
            finalize: VecDeque::from([done(1)]),
            ..Script::default()
        });
        let tokens = tokens();

        let output = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        assert_eq!(output.version, 1);
        let calls = gateway.calls();
        let creates: Vec<&String> = calls.iter().filter(|c| c.starts_with("create ")).collect();
        assert_ne!(creates[0].split(' ').nth(1), creates[1].split(' ').nth(1));
    }

    #[tokio::test]
    async fn stops_after_a_second_expiry() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("expired", &[])), Ok(session("expired", &[]))]),
            ..Script::default()
        });
        let tokens = tokens();
        let error = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap_err();
        assert_eq!(api_code(&error.0), Some("SESSION_EXPIRED"));
    }

    #[tokio::test]
    async fn finalizes_when_a_replayed_session_was_already_published() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("published", &[]))]),
            finalize: VecDeque::from([done(7)]),
            ..Script::default()
        });
        let tokens = tokens();

        let output = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        assert_eq!(output.version, 7);
        assert!(put_calls(&gateway.calls()).is_empty());
    }

    #[tokio::test]
    async fn finalizes_to_confirm_when_an_upload_says_the_session_is_no_longer_pending() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &[]))]),
            put: VecDeque::from([Err(api(409, "SESSION_NOT_PENDING"))]),
            finalize: VecDeque::from([done(3)]),
            ..Script::default()
        });
        let tokens = tokens();

        let output = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        assert_eq!(output.version, 3);
        assert_eq!(put_calls(&gateway.calls()).len(), 1);
    }

    #[tokio::test]
    async fn never_retries_a_publish_conflict() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &[]))]),
            finalize: VecDeque::from([Err(api(409, "PUBLISH_CONFLICT"))]),
            ..Script::default()
        });
        let tokens = tokens();

        let (error, exit) = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap_err();

        assert_eq!(api_code(&error), Some("PUBLISH_CONFLICT"));
        assert_eq!(exit, crate::EXIT_CONFLICT);
        assert_eq!(
            gateway
                .calls()
                .iter()
                .filter(|c| c.starts_with("finalize"))
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn a_stale_base_version_is_a_conflict_exit() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Err(api(409, "BASE_VERSION_CONFLICT"))]),
            ..Script::default()
        });
        let tokens = tokens();
        let request = PublishRequest {
            artifact_id: Some("A1"),
            base_version: Some(1),
            title: None,
            ..new_request(&scan)
        };

        let (_, exit) = flow(&gateway, &tokens).publish(&request).await.unwrap_err();

        assert_eq!(exit, crate::EXIT_CONFLICT);
    }

    #[tokio::test]
    async fn retries_server_errors_with_the_same_idempotency_key_then_succeeds() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([
                Err(api(503, "INTERNAL_ERROR")),
                Err(api(500, "STORAGE_ERROR")),
                Ok(session("pending", &[])),
            ]),
            finalize: VecDeque::from([done(1)]),
            ..Script::default()
        });
        let tokens = tokens();

        flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        let calls = gateway.calls();
        let keys: Vec<&str> = calls
            .iter()
            .filter(|c| c.starts_with("create "))
            .map(|c| c.split(' ').nth(1).unwrap())
            .collect();
        assert_eq!(keys.len(), 3);
        assert!(keys.iter().all(|k| *k == keys[0]));
    }

    #[tokio::test]
    async fn stops_retrying_after_three_retries() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([
                Err(api(503, "x")),
                Err(api(503, "x")),
                Err(api(503, "x")),
                Err(api(503, "x")),
                Ok(session("pending", &[])),
            ]),
            ..Script::default()
        });
        let tokens = tokens();

        let error = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap_err();

        assert!(matches!(error.0, CliError::Api { status: 503, .. }));
        assert_eq!(
            gateway
                .calls()
                .iter()
                .filter(|c| c.starts_with("create "))
                .count(),
            4
        );
    }

    #[tokio::test]
    async fn client_errors_are_not_retried() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([
                Err(api(422, "TREE_DIGEST_MISMATCH")),
                Ok(session("pending", &[])),
            ]),
            ..Script::default()
        });
        let tokens = tokens();

        let (error, exit) = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap_err();

        assert_eq!(api_code(&error), Some("TREE_DIGEST_MISMATCH"));
        assert_eq!(exit, EXIT_INVALID_ARGUMENT);
        assert_eq!(
            gateway
                .calls()
                .iter()
                .filter(|c| c.starts_with("create "))
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn refreshes_the_token_once_on_401_and_resends_the_same_bytes() {
        let (_dir, scan) = site();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &[]))]),
            put: VecDeque::from([Err(api(401, "UNAUTHORIZED"))]),
            finalize: VecDeque::from([done(1)]),
            ..Script::default()
        });
        let tokens = tokens();

        flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap();

        assert_eq!(*tokens.refreshed.lock().unwrap(), 1);
        let calls = gateway.calls();
        let puts = put_calls(&calls);
        assert!(puts[0].ends_with(" old") && puts[1].ends_with(" new"));
        // the retry of the first file carries the same byte count
        assert_eq!(puts[0].split(' ').nth(2), puts[1].split(' ').nth(2));
    }

    #[tokio::test]
    async fn stops_when_a_file_changed_after_the_scan() {
        let (dir, scan) = site();
        std::fs::write(dir.path().join("assets/app.js"), b"changed after scan!").unwrap();
        let gateway = FakeGateway::new(Script {
            create: VecDeque::from([Ok(session("pending", &[]))]),
            ..Script::default()
        });
        let tokens = tokens();

        let (error, _) = flow(&gateway, &tokens)
            .publish(&new_request(&scan))
            .await
            .unwrap_err();

        assert!(error.to_string().contains("changed after it was scanned"));
        assert!(gateway.calls().iter().all(|c| !c.starts_with("finalize")));
    }

    fn download_fixture() -> (Script, Vec<ArtifactFileInfo>) {
        let make = |path: &str, content: &[u8]| ArtifactFileInfo {
            path: path.to_string(),
            size: content.len() as u64,
            sha256: sha256_hex(content),
            content_type: "text/plain".into(),
        };
        let files = vec![make("index.html", b"<html>"), make("assets/app.js", b"js")];
        let entries: Vec<crate::artifact::digest::DigestEntry> = files
            .iter()
            .map(|f| crate::artifact::digest::DigestEntry {
                path: f.path.clone(),
                size: f.size,
                sha256: f.sha256.clone(),
            })
            .collect();
        let mut script = Script {
            tree_digest: crate::artifact::digest::tree_digest(&entries),
            files: files.clone(),
            latest_version: Some(5),
            ..Script::default()
        };
        script
            .downloads
            .insert("index.html".into(), b"<html>".to_vec());
        script
            .downloads
            .insert("assets/app.js".into(), b"js".to_vec());
        (script, files)
    }

    #[tokio::test]
    async fn downloads_the_latest_version_pinned_up_front() {
        let (script, _) = download_fixture();
        let gateway = FakeGateway::new(script);
        let tokens = tokens();
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");

        let output = flow(&gateway, &tokens)
            .download("p", "A1", None, &out)
            .await
            .unwrap();

        assert_eq!(output.version, 5);
        assert_eq!(output.file_count, 2);
        assert_eq!(std::fs::read(out.join("assets/app.js")).unwrap(), b"js");
        assert!(
            gateway
                .calls()
                .iter()
                .any(|c| c.starts_with("get_version 5"))
        );
    }

    #[tokio::test]
    async fn leaves_nothing_behind_when_a_file_fails_verification() {
        let (mut script, _) = download_fixture();
        script
            .downloads
            .insert("assets/app.js".into(), b"XX".to_vec());
        let gateway = FakeGateway::new(script);
        let tokens = tokens();
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");

        let result = flow(&gateway, &tokens)
            .download("p", "A1", Some(5), &out)
            .await;

        assert!(result.is_err());
        assert!(!out.exists());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn refuses_a_hostile_manifest_before_downloading_anything() {
        let (mut script, mut files) = download_fixture();
        files[0].path = "../escape.html".into();
        script.files = files;
        let gateway = FakeGateway::new(script);
        let tokens = tokens();
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");

        let (error, _) = flow(&gateway, &tokens)
            .download("p", "A1", Some(5), &out)
            .await
            .unwrap_err();

        assert!(error.to_string().contains("Invalid manifest"));
        assert!(!out.exists());
    }

    #[tokio::test]
    async fn refuses_a_non_empty_destination_without_touching_it() {
        let (script, _) = download_fixture();
        let gateway = FakeGateway::new(script);
        let tokens = tokens();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("keep.txt"), b"mine").unwrap();

        let (error, exit) = flow(&gateway, &tokens)
            .download("p", "A1", Some(5), dir.path())
            .await
            .unwrap_err();

        assert!(error.to_string().contains("not empty"));
        assert_eq!(exit, EXIT_INVALID_ARGUMENT);
        assert_eq!(std::fs::read(dir.path().join("keep.txt")).unwrap(), b"mine");
    }

    #[tokio::test]
    async fn an_artifact_without_versions_cannot_be_downloaded() {
        let (mut script, _) = download_fixture();
        script.latest_version = None;
        let gateway = FakeGateway::new(script);
        let tokens = tokens();
        let dir = tempfile::tempdir().unwrap();
        let error = flow(&gateway, &tokens)
            .download("p", "A1", None, &dir.path().join("x"))
            .await
            .unwrap_err();
        assert!(error.0.to_string().contains("no versions"));
    }
}
