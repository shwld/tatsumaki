use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::random;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, io::{Read, Write}, net::TcpListener, time::{Duration, SystemTime}};

use crate::{CliError, EXIT_AUTH, EXIT_CONFIG, EXIT_INVALID_ARGUMENT};
use semver::Version;
use super::ports::{AuthGateway, CliVersionResponse, ConfigStore, ProjectGateway, ProjectGetBody, StoryCommentInput, StoryCreateInput, StoryGateway, StoryGetBody, StoryListBody, StoryListFilter, StoryReorderInput, StoryUpdateInput, TokenCache, TokenStore, UserGateway, VersionGateway, WhoamiResponse};

pub struct CliService<TS, CS, AG, SG, UG, VG, PG> {
    pub token_store: TS,
    pub config_store: CS,
    pub auth_gateway: AG,
    pub story_gateway: SG,
    pub user_gateway: UG,
    pub version_gateway: VG,
    pub project_gateway: PG,
}

impl<TS, CS, AG, SG, UG, VG, PG> CliService<TS, CS, AG, SG, UG, VG, PG>
where
    TS: TokenStore,
    CS: ConfigStore,
    AG: AuthGateway,
    SG: StoryGateway,
    UG: UserGateway,
    VG: VersionGateway,
    PG: ProjectGateway,
{
    pub async fn ensure_access_token(&self, base_url: &str) -> Result<String, (CliError, i32)> {
        if let Ok(token) = std::env::var("TATSUMAKI_TOKEN") {
            return Ok(token);
        }
        let mut cache = self.token_store.load().map_err(|e| (e, EXIT_AUTH))?;
        if !cache.access_token.is_empty() && !is_expired(&cache) {
            return Ok(cache.access_token);
        }
        self.refresh_access_token(base_url, &mut cache).await
    }

    pub async fn refresh_access_token(&self, _base_url: &str, cache: &mut TokenCache) -> Result<String, (CliError, i32)> {
        let refresh = cache.refresh_token.clone().ok_or_else(|| (CliError::Message("Not logged in. Run: tm login".to_string()), EXIT_AUTH))?;
        let token = self.auth_gateway.refresh_token(&cache.client_id, &refresh).await.map_err(|e| (e, EXIT_AUTH))?;
        cache.access_token = token.access_token;
        cache.refresh_token = token.refresh_token.or(cache.refresh_token.clone());
        cache.token_type = token.token_type.or(cache.token_type.clone());
        cache.expires_in = token.expires_in.or(cache.expires_in);
        cache.obtained_at_unix = Some(now_unix());
        self.token_store.save(cache).map_err(|e| (e, EXIT_AUTH))?;
        Ok(cache.access_token.clone())
    }

    pub async fn login(&self, base_url: &str) -> Result<(), (CliError, i32)> {
        let callback_port = pick_loopback_port().map_err(|e| (CliError::Io(e), EXIT_AUTH))?;
        let redirect_uri = format!("http://127.0.0.1:{callback_port}/callback");
        let client_id = self.auth_gateway.register_client(&redirect_uri).await.map_err(|e| (e, EXIT_AUTH))?;
        let verifier = random_urlsafe(64);
        let challenge = code_challenge(&verifier);
        let state = random_urlsafe(32);
        let authorize_url = format!(
            "{base_url}/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope=mcp&state={}&code_challenge={}&code_challenge_method=S256&resource={}",
            urlencoding::encode(&client_id),
            urlencoding::encode(&redirect_uri),
            state,
            challenge,
            urlencoding::encode(&format!("{base_url}/programmatic-api/v1"))
        );
        let _ = webbrowser::open(&authorize_url);
        eprintln!("Open this URL if browser did not open:\n{authorize_url}");

        let callback_query = wait_for_callback_query(callback_port, Duration::from_secs(180)).map_err(|e| (CliError::Message(e), EXIT_AUTH))?;
        let query_map: HashMap<String, String> = url::form_urlencoded::parse(callback_query.as_bytes()).into_owned().collect();
        if query_map.get("state") != Some(&state) {
            return Err((CliError::Message("OAuth state mismatch".to_string()), EXIT_AUTH));
        }
        let code = query_map.get("code").ok_or_else(|| (CliError::Message("OAuth callback missing code".to_string()), EXIT_AUTH))?;
        let token = self.auth_gateway.exchange_code(&client_id, code, &redirect_uri, &verifier).await.map_err(|e| (e, EXIT_AUTH))?;
        self.token_store.save(&TokenCache {
            client_id,
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            token_type: token.token_type,
            expires_in: token.expires_in,
            obtained_at_unix: Some(now_unix()),
        }).map_err(|e| (e, EXIT_AUTH))?;
        Ok(())
    }

    pub async fn get_story(
        &self,
        base_url: &str,
        project: &str,
        story_number: i64,
        allow_json: bool,
    ) -> Result<StoryGetBody, (CliError, i32)> {
        if story_number <= 0 {
            return Err((CliError::Message("storyNumber must be a positive integer".to_string()), EXIT_INVALID_ARGUMENT));
        }
        let mut token = self.ensure_access_token(base_url).await?;
        match self.story_gateway.get_story(project, story_number, &token).await {
            Ok(body) => Ok(body),
            Err(e) => {
                if crate::is_unauthorized(&e) {
                    let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                    token = self.refresh_access_token(base_url, &mut cache).await?;
                    let body = self
                        .story_gateway
                        .get_story(project, story_number, &token)
                        .await
                        .map_err(|err| {
                            let code = crate::exit_code_for_error(&err);
                            (err, code)
                        })?;
                    Ok(body)
                } else {
                    let _ = allow_json;
                    let code = crate::exit_code_for_error(&e);
                    Err((e, code))
                }
            }
        }
    }

    pub async fn list_stories(
        &self,
        base_url: &str,
        project: &str,
        filter: &StoryListFilter,
    ) -> Result<StoryListBody, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.story_gateway.list_stories(project, filter, &token).await {
            Ok(body) => Ok(body),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.story_gateway
                    .list_stories(project, filter, &token)
                    .await
                    .map_err(|err| {
                        let code = crate::exit_code_for_error(&err);
                        (err, code)
                    })
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn get_project(
        &self,
        base_url: &str,
        project: &str,
    ) -> Result<ProjectGetBody, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.project_gateway.get_project(project, &token).await {
            Ok(body) => Ok(body),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.project_gateway
                    .get_project(project, &token)
                    .await
                    .map_err(|err| {
                        let code = crate::exit_code_for_error(&err);
                        (err, code)
                    })
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn create_story(&self, base_url: &str, project: &str, input: &StoryCreateInput) -> Result<StoryGetBody, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.story_gateway.create_story(project, input, &token).await {
            Ok(body) => Ok(body),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.story_gateway.create_story(project, input, &token).await.map_err(|err| {
                    let code = crate::exit_code_for_error(&err);
                    (err, code)
                })
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn update_story(&self, base_url: &str, project: &str, story_number: i64, input: &StoryUpdateInput) -> Result<StoryGetBody, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.story_gateway.update_story(project, story_number, input, &token).await {
            Ok(body) => Ok(body),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.story_gateway.update_story(project, story_number, input, &token).await.map_err(|err| {
                    let code = crate::exit_code_for_error(&err);
                    (err, code)
                })
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn reorder_stories(&self, base_url: &str, project: &str, input: &StoryReorderInput) -> Result<StoryListBody, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.story_gateway.reorder_stories(project, input, &token).await {
            Ok(body) => Ok(body),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.story_gateway.reorder_stories(project, input, &token).await.map_err(|err| {
                    let code = crate::exit_code_for_error(&err);
                    (err, code)
                })
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn create_story_comment(&self, base_url: &str, project: &str, story_number: i64, input: &StoryCommentInput) -> Result<serde_json::Value, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.story_gateway.create_story_comment(project, story_number, input, &token).await {
            Ok(body) => Ok(body),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.story_gateway.create_story_comment(project, story_number, input, &token).await.map_err(|err| {
                    let code = crate::exit_code_for_error(&err);
                    (err, code)
                })
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn whoami(&self, base_url: &str) -> Result<WhoamiResponse, (CliError, i32)> {
        let mut token = self.ensure_access_token(base_url).await?;
        match self.user_gateway.whoami(&token).await {
            Ok(v) => Ok(v),
            Err(e) if crate::is_unauthorized(&e) => {
                let mut cache = self.token_store.load().map_err(|err| (err, EXIT_AUTH))?;
                token = self.refresh_access_token(base_url, &mut cache).await?;
                self.user_gateway.whoami(&token).await.map_err(|err| (err, EXIT_AUTH))
            }
            Err(e) => {
                let code = crate::exit_code_for_error(&e);
                Err((e, code))
            }
        }
    }

    pub async fn check_version_compatibility(&self, base_url: &str, current_version: &str) -> Option<String> {
        let token = self.ensure_access_token(base_url).await.ok()?;
        let server = self.version_gateway.get_version(&token).await.ok()?;
        compatibility_warning(current_version, &server)
    }
}

pub fn compatibility_warning(current_version: &str, server: &CliVersionResponse) -> Option<String> {
    let current = match Version::parse(current_version) {
        Ok(v) => v,
        Err(_) => {
            return Some(format!(
                "Warning: failed to parse client version `{current_version}`; skipping compatibility check."
            ))
        }
    };
    let min = match Version::parse(&server.min_client_version) {
        Ok(v) => v,
        Err(_) => {
            return Some(format!(
                "Warning: server returned invalid minClientVersion `{}`; skipping compatibility check.",
                server.min_client_version
            ))
        }
    };
    if current < min {
        return Some(format!(
            "Warning: this tm version ({current}) is older than the server minimum ({min}). Please upgrade tm."
        ));
    }
    None
}

pub fn resolve_base_url<CS: ConfigStore>(config_store: &CS, cli_base_url: Option<String>) -> Result<String, (CliError, i32)> {
    if let Some(url) = cli_base_url {
        return Ok(url);
    }
    config_store
        .load_base_url()
        .map_err(|e| (e, EXIT_CONFIG))?
        .ok_or_else(|| (CliError::Message("base-url is not configured. Run: tm config set base-url <URL>".to_string()), EXIT_CONFIG))
}

fn now_unix() -> u64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn is_expired(cache: &TokenCache) -> bool {
    let expires_in = match cache.expires_in { Some(v) if v > 0 => v, _ => return false };
    let obtained_at = match cache.obtained_at_unix { Some(v) => v, None => return false };
    now_unix() >= obtained_at.saturating_add(expires_in.saturating_sub(30))
}

fn pick_loopback_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

fn wait_for_callback_query(port: u16, timeout: Duration) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    loop {
        if start.elapsed() > timeout { return Err("OAuth callback timed out".to_string()); }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
                let req = String::from_utf8_lossy(&buf[..n]);
                let line = req.lines().next().unwrap_or_default();
                let path = line.split_whitespace().nth(1).unwrap_or("/");
                let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
                let body = "Authentication completed. You can close this tab.";
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                let _ = stream.write_all(response.as_bytes());
                return Ok(query.to_string());
            }
            Err(_) => std::thread::sleep(Duration::from_millis(100)),
        }
    }
}

fn random_urlsafe(len: usize) -> String {
    let bytes: Vec<u8> = (0..len).map(|_| random::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(bytes)
}

fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

#[cfg(test)]
mod tests {
    use super::{compatibility_warning, CliVersionResponse};

    #[test]
    fn warns_when_client_is_older_than_minimum() {
        let warning = compatibility_warning(
            "0.0.5",
            &CliVersionResponse {
                api_version: "0.0.5".to_string(),
                min_client_version: "0.2.0".to_string(),
            },
        );
        assert!(warning.is_some());
    }

    #[test]
    fn no_warning_when_client_is_new_enough() {
        let warning = compatibility_warning(
            "0.2.1",
            &CliVersionResponse {
                api_version: "0.0.5".to_string(),
                min_client_version: "0.2.0".to_string(),
            },
        );
        assert!(warning.is_none());
    }
}
