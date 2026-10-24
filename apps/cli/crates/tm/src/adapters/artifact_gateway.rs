use std::time::Duration;

use reqwest::{StatusCode, header};

use crate::{
    CliError,
    application::ports::{
        ArtifactDetailBody, ArtifactGateway, ArtifactInfo, ArtifactVersionFilesBody,
        ArtifactVersionInfo, CreateUploadInput, CreateUploadOutcome, FinalizeBody, UploadSession,
    },
    artifact::url::encode_file_path,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

pub struct HttpArtifactGateway {
    pub base_url: String,
    pub client: reqwest::Client,
}

impl HttpArtifactGateway {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .unwrap_or_default(),
        }
    }

    fn project_url(&self, project: &str) -> String {
        format!(
            "{}/programmatic-api/v1/projects/{}",
            self.base_url.trim_end_matches('/'),
            urlencoding::encode(project)
        )
    }

    fn artifact_url(&self, project: &str, artifact_id: &str) -> String {
        format!(
            "{}/artifacts/{}",
            self.project_url(project),
            urlencoding::encode(artifact_id)
        )
    }

    async fn checked(response: reqwest::Response) -> Result<reqwest::Response, CliError> {
        if response.status().is_success() {
            return Ok(response);
        }
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let body = response.text().await.unwrap_or_default();
        Err(parse_api_error(status, &body, retry_after))
    }

    async fn json<T: serde::de::DeserializeOwned>(
        response: reqwest::Response,
    ) -> Result<T, CliError> {
        Ok(Self::checked(response).await?.json().await?)
    }
}

/// Builds the error for a non-success answer. The body is the server's
/// `{ error, code }`; anything else falls back to the status text.
pub fn parse_api_error(status: u16, body: &str, retry_after_secs: Option<u64>) -> CliError {
    #[derive(serde::Deserialize)]
    struct ErrorBody {
        error: Option<String>,
        code: Option<String>,
    }
    if status == StatusCode::UNAUTHORIZED.as_u16() {
        return CliError::Api {
            status,
            code: "UNAUTHORIZED".to_string(),
            message: "Unauthorized".to_string(),
            retry_after_secs,
        };
    }
    let parsed = serde_json::from_str::<ErrorBody>(body).ok();
    let code = parsed
        .as_ref()
        .and_then(|b| b.code.clone())
        .unwrap_or_else(|| format!("HTTP_{status}"));
    let message = parsed
        .and_then(|b| b.error)
        .unwrap_or_else(|| format!("Request failed with status {status}"));
    CliError::Api {
        status,
        code,
        message,
        retry_after_secs,
    }
}

#[derive(serde::Deserialize)]
struct ArtifactsBody {
    artifacts: Vec<ArtifactInfo>,
}
#[derive(serde::Deserialize)]
struct ArtifactBody {
    artifact: ArtifactInfo,
}
#[derive(serde::Deserialize)]
struct VersionsBody {
    versions: Vec<ArtifactVersionInfo>,
}

#[async_trait::async_trait]
impl ArtifactGateway for HttpArtifactGateway {
    async fn list_artifacts(
        &self,
        project: &str,
        archived: bool,
        bearer_token: &str,
    ) -> Result<Vec<ArtifactInfo>, CliError> {
        let response = self
            .client
            .get(format!("{}/artifacts", self.project_url(project)))
            .query(&[("archived", archived.to_string())])
            .bearer_auth(bearer_token)
            .send()
            .await?;
        Ok(Self::json::<ArtifactsBody>(response).await?.artifacts)
    }

    async fn get_artifact(
        &self,
        project: &str,
        artifact_id: &str,
        bearer_token: &str,
    ) -> Result<ArtifactDetailBody, CliError> {
        let response = self
            .client
            .get(self.artifact_url(project, artifact_id))
            .bearer_auth(bearer_token)
            .send()
            .await?;
        Self::json(response).await
    }

    async fn update_artifact_title(
        &self,
        project: &str,
        artifact_id: &str,
        title: &str,
        bearer_token: &str,
    ) -> Result<ArtifactInfo, CliError> {
        let response = self
            .client
            .patch(self.artifact_url(project, artifact_id))
            .bearer_auth(bearer_token)
            .json(&serde_json::json!({ "title": title }))
            .send()
            .await?;
        Ok(Self::json::<ArtifactBody>(response).await?.artifact)
    }

    async fn set_artifact_archived(
        &self,
        project: &str,
        artifact_id: &str,
        archived: bool,
        bearer_token: &str,
    ) -> Result<ArtifactInfo, CliError> {
        let action = if archived { "archive" } else { "unarchive" };
        let response = self
            .client
            .post(format!(
                "{}/{action}",
                self.artifact_url(project, artifact_id)
            ))
            .bearer_auth(bearer_token)
            .send()
            .await?;
        Ok(Self::json::<ArtifactBody>(response).await?.artifact)
    }

    async fn list_artifact_versions(
        &self,
        project: &str,
        artifact_id: &str,
        bearer_token: &str,
    ) -> Result<Vec<ArtifactVersionInfo>, CliError> {
        let response = self
            .client
            .get(format!(
                "{}/versions",
                self.artifact_url(project, artifact_id)
            ))
            .bearer_auth(bearer_token)
            .send()
            .await?;
        Ok(Self::json::<VersionsBody>(response).await?.versions)
    }

    async fn get_artifact_version(
        &self,
        project: &str,
        artifact_id: &str,
        version: i64,
        bearer_token: &str,
    ) -> Result<ArtifactVersionFilesBody, CliError> {
        let response = self
            .client
            .get(format!(
                "{}/versions/{version}",
                self.artifact_url(project, artifact_id)
            ))
            .bearer_auth(bearer_token)
            .send()
            .await?;
        Self::json(response).await
    }

    async fn create_upload(
        &self,
        project: &str,
        input: &CreateUploadInput,
        idempotency_key: &str,
        bearer_token: &str,
    ) -> Result<CreateUploadOutcome, CliError> {
        let response = self
            .client
            .post(format!("{}/artifact-uploads", self.project_url(project)))
            .bearer_auth(bearer_token)
            .header("Idempotency-Key", idempotency_key)
            .json(input)
            .send()
            .await?;
        let body: serde_json::Value = Self::json(response).await?;
        if body.get("noop").and_then(|v| v.as_bool()) == Some(true) {
            return Ok(CreateUploadOutcome::Noop {
                artifact_id: body["artifactId"].as_str().unwrap_or_default().to_string(),
                version: body["version"].as_i64().unwrap_or_default(),
            });
        }
        let session: UploadSession = serde_json::from_value(body)?;
        Ok(CreateUploadOutcome::Session(session))
    }

    async fn put_upload_file(
        &self,
        project: &str,
        session_id: &str,
        path: &str,
        bytes: Vec<u8>,
        bearer_token: &str,
    ) -> Result<(), CliError> {
        let url = format!(
            "{}/artifact-uploads/{}/files/{}",
            self.project_url(project),
            urlencoding::encode(session_id),
            encode_file_path(path)
        );
        let response = self
            .client
            .put(url)
            .bearer_auth(bearer_token)
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .body(bytes)
            .send()
            .await?;
        Self::checked(response).await?;
        Ok(())
    }

    async fn finalize_upload(
        &self,
        project: &str,
        session_id: &str,
        bearer_token: &str,
    ) -> Result<FinalizeBody, CliError> {
        let response = self
            .client
            .post(format!(
                "{}/artifact-uploads/{}/finalize",
                self.project_url(project),
                urlencoding::encode(session_id)
            ))
            .bearer_auth(bearer_token)
            .send()
            .await?;
        Self::json(response).await
    }

    async fn download_file(
        &self,
        project: &str,
        artifact_id: &str,
        version: i64,
        path: &str,
        max_bytes: u64,
        bearer_token: &str,
    ) -> Result<Vec<u8>, CliError> {
        let url = format!(
            "{}/versions/{version}/files/{}",
            self.artifact_url(project, artifact_id),
            encode_file_path(path)
        );
        let mut response = Self::checked(
            self.client
                .get(url)
                .bearer_auth(bearer_token)
                .send()
                .await?,
        )
        .await?;
        if response.content_length().is_some_and(|len| len > max_bytes) {
            return Err(CliError::Message(format!(
                "{path} is larger than the size in the manifest"
            )));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() as u64 + chunk.len() as u64 > max_bytes {
                return Err(CliError::Message(format!(
                    "{path} is larger than the size in the manifest"
                )));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    /// Serves one canned response and returns the raw request it received.
    fn serve_once(
        status_line: &str,
        headers: &str,
        body: &str,
    ) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let response = format!(
            "HTTP/1.1 {status_line}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut received = Vec::new();
            let mut buffer = [0u8; 8192];
            loop {
                let read = stream.read(&mut buffer).unwrap();
                received.extend_from_slice(&buffer[..read]);
                let text = String::from_utf8_lossy(&received);
                if let Some(header_end) = text.find("\r\n\r\n") {
                    let content_length = text[..header_end]
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if received.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
                if read == 0 {
                    break;
                }
            }
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8_lossy(&received).into_owned()
        });
        (address, handle)
    }

    fn gateway(base_url: String) -> HttpArtifactGateway {
        // main() installs the provider; the test binary has to do it itself.
        let _ = rustls::crypto::ring::default_provider().install_default();
        HttpArtifactGateway::new(base_url)
    }

    #[test]
    fn parses_the_server_error_body() {
        let error = parse_api_error(
            409,
            r#"{"error":"stale","code":"BASE_VERSION_CONFLICT"}"#,
            None,
        );
        let CliError::Api {
            status,
            code,
            message,
            ..
        } = error
        else {
            panic!("expected an API error");
        };
        assert_eq!(
            (status, code.as_str(), message.as_str()),
            (409, "BASE_VERSION_CONFLICT", "stale")
        );
    }

    #[test]
    fn falls_back_when_the_body_is_not_the_server_error() {
        let CliError::Api { code, message, .. } =
            parse_api_error(502, "<html>bad gateway</html>", Some(3))
        else {
            panic!("expected an API error");
        };
        assert_eq!(code, "HTTP_502");
        assert!(message.contains("502"));
    }

    #[test]
    fn maps_401_to_the_unauthorized_error_the_refresh_logic_looks_for() {
        let error = parse_api_error(401, "{}", None);
        assert!(crate::is_unauthorized(&error));
    }

    #[tokio::test]
    async fn puts_a_file_with_each_segment_encoded() {
        let (address, request) = serve_once(
            "200 OK",
            "Content-Type: application/json\r\n",
            r#"{"path":"x","uploadedCount":1}"#,
        );
        gateway(address)
            .put_upload_file(
                "proj",
                "SESSION",
                "日本語/100%.txt",
                b"hello".to_vec(),
                "tok",
            )
            .await
            .unwrap();

        let raw = request.join().unwrap();
        let first_line = raw.lines().next().unwrap();
        assert_eq!(
            first_line,
            "PUT /programmatic-api/v1/projects/proj/artifact-uploads/SESSION/files/%E6%97%A5%E6%9C%AC%E8%AA%9E/100%25.txt HTTP/1.1"
        );
        assert!(raw.to_lowercase().contains("authorization: bearer tok"));
        assert!(
            raw.to_lowercase()
                .contains("content-type: application/octet-stream")
        );
        assert!(raw.ends_with("hello"));
    }

    #[tokio::test]
    async fn sends_the_idempotency_key_and_reads_a_session() {
        let body = r#"{"noop":false,"sessionId":"S1","artifactId":"A1","baseVersion":null,"status":"pending","expiresAt":"t","uploadedPaths":["a.js"]}"#;
        let (address, request) =
            serve_once("201 Created", "Content-Type: application/json\r\n", body);
        let outcome = gateway(address)
            .create_upload(
                "proj",
                &CreateUploadInput {
                    artifact_id: None,
                    title: Some("Demo".into()),
                    base_version: None,
                    entrypoint: "index.html".into(),
                    tree_digest: "d".into(),
                    files: vec![],
                },
                "key-1",
                "tok",
            )
            .await
            .unwrap();

        assert_eq!(
            outcome,
            CreateUploadOutcome::Session(UploadSession {
                session_id: "S1".into(),
                artifact_id: "A1".into(),
                status: "pending".into(),
                uploaded_paths: vec!["a.js".into()],
            })
        );
        let raw = request.join().unwrap().to_lowercase();
        assert!(raw.contains("idempotency-key: key-1"));
        assert!(
            !raw.contains("artifactid"),
            "a new artifact must not send artifactId"
        );
    }

    #[tokio::test]
    async fn reads_a_noop_answer() {
        let (address, _request) = serve_once(
            "200 OK",
            "Content-Type: application/json\r\n",
            r#"{"noop":true,"artifactId":"A1","version":3}"#,
        );
        let outcome = gateway(address)
            .create_upload(
                "proj",
                &CreateUploadInput {
                    artifact_id: Some("A1".into()),
                    title: None,
                    base_version: Some(3),
                    entrypoint: "index.html".into(),
                    tree_digest: "d".into(),
                    files: vec![],
                },
                "key-1",
                "tok",
            )
            .await
            .unwrap();
        assert_eq!(
            outcome,
            CreateUploadOutcome::Noop {
                artifact_id: "A1".into(),
                version: 3
            }
        );
    }

    #[tokio::test]
    async fn turns_a_conflict_answer_into_an_api_error() {
        let (address, _request) = serve_once(
            "409 Conflict",
            "Content-Type: application/json\r\n",
            r#"{"error":"stale","code":"PUBLISH_CONFLICT"}"#,
        );
        let error = gateway(address)
            .finalize_upload("proj", "S1", "tok")
            .await
            .unwrap_err();
        let CliError::Api { code, .. } = error else {
            panic!("expected an API error")
        };
        assert_eq!(code, "PUBLISH_CONFLICT");
    }

    #[tokio::test]
    async fn refuses_a_download_larger_than_the_manifest_size() {
        let (address, _request) = serve_once(
            "200 OK",
            "Content-Type: application/octet-stream\r\n",
            "0123456789",
        );
        let error = gateway(address)
            .download_file("proj", "A1", 1, "a.txt", 4, "tok")
            .await
            .unwrap_err();
        assert!(error.to_string().contains("larger"));
    }

    #[tokio::test]
    async fn downloads_a_file_within_the_limit() {
        let (address, request) = serve_once(
            "200 OK",
            "Content-Type: application/octet-stream\r\n",
            "0123",
        );
        let bytes = gateway(address)
            .download_file("proj", "A1", 2, "a b/c.txt", 4, "tok")
            .await
            .unwrap();
        assert_eq!(bytes, b"0123");
        let raw = request.join().unwrap();
        assert!(raw.lines().next().unwrap().starts_with(
            "GET /programmatic-api/v1/projects/proj/artifacts/A1/versions/2/files/a%20b/c.txt "
        ));
    }

    /// The gateway builds its URLs by hand, so this guards against the
    /// contract and the CLI drifting apart (`openapi:check` only watches the
    /// server side).
    #[test]
    fn every_endpoint_the_gateway_uses_is_in_the_openapi_contract() {
        let contract: serde_json::Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../../packages/contracts/cli-openapi.json"
        )))
        .unwrap();
        let base = "/programmatic-api/v1/projects/{projectId}";
        let used = [
            ("get", "/artifacts"),
            ("get", "/artifacts/{artifactId}"),
            ("patch", "/artifacts/{artifactId}"),
            ("post", "/artifacts/{artifactId}/archive"),
            ("post", "/artifacts/{artifactId}/unarchive"),
            ("get", "/artifacts/{artifactId}/versions"),
            ("get", "/artifacts/{artifactId}/versions/{version}"),
            (
                "get",
                "/artifacts/{artifactId}/versions/{version}/files/{path}",
            ),
            ("post", "/artifact-uploads"),
            ("put", "/artifact-uploads/{sessionId}/files/{path}"),
            ("post", "/artifact-uploads/{sessionId}/finalize"),
        ];
        for (method, suffix) in used {
            let operation = &contract["paths"][format!("{base}{suffix}")][method];
            assert!(
                operation.is_object(),
                "{method} {suffix} is missing from the contract"
            );
        }

        let create = &contract["paths"][format!("{base}/artifact-uploads")]["post"];
        let has_idempotency_header = create["parameters"].as_array().unwrap().iter().any(|p| {
            p["name"] == "Idempotency-Key" && p["in"] == "header" && p["required"] == true
        });
        assert!(
            has_idempotency_header,
            "Idempotency-Key must be a required header"
        );
    }
}
