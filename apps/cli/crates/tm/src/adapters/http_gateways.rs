use progenitor::generate_api;
use reqwest::StatusCode;

use crate::{application::ports::{AuthGateway, CliVersionResponse, OAuthTokenResponse, ProjectGateway, ProjectGetBody, StoryCommentInput, StoryCreateInput, StoryGateway, StoryGetBody, StoryListBody, StoryListFilter, StoryPointUpdate, StoryReorderInput, StoryUpdateInput, UserGateway, VersionGateway, WhoamiResponse}, CliError};
use crate::infrastructure::http_client;
use self::types::{CliVersionCompatibilityResponse, GetProjectProjectId, GetStoryByNumberProjectId, GetStoryByNumberStoryNumber, ListStoriesIterationDateScope, ListStoriesLimit, ListStoriesProjectId, StoryStatus};

generate_api!("../../../../packages/contracts/cli-openapi.json");

pub struct HttpAuthGateway {
  pub base_url: String,
  pub client: reqwest::Client,
}

#[derive(serde::Deserialize)]
struct RegisterClientResponse { client_id: String }

#[async_trait::async_trait]
impl AuthGateway for HttpAuthGateway {
  async fn register_client(&self, redirect_uri: &str) -> Result<String, CliError> {
    let payload = serde_json::json!({
      "client_name": "tatsumaki-cli",
      "redirect_uris": [redirect_uri],
      "grant_types": ["authorization_code", "refresh_token"],
      "response_types": ["code"],
      "token_endpoint_auth_method": "none",
      "scope": "mcp"
    });
    let response = http_client::post_json(&self.client, format!("{}/oauth/register", self.base_url), payload).await?;
    if !response.status().is_success() {
      return Err(CliError::Message(format!("OAuth client registration failed: {}", response.status())));
    }
    Ok(response.json::<RegisterClientResponse>().await?.client_id)
  }

  async fn exchange_code(&self, client_id: &str, code: &str, redirect_uri: &str, verifier: &str) -> Result<OAuthTokenResponse, CliError> {
    let params = [
      ("grant_type", "authorization_code"),
      ("client_id", client_id),
      ("code", code),
      ("redirect_uri", redirect_uri),
      ("code_verifier", verifier),
    ];
    let response = http_client::post_form(&self.client, format!("{}/oauth/token", self.base_url), &params).await?;
    if !response.status().is_success() {
      return Err(CliError::Message(format!("Token exchange failed: {}", response.status())));
    }
    response.json().await.map_err(CliError::Request)
  }

  async fn refresh_token(&self, client_id: &str, refresh_token: &str) -> Result<OAuthTokenResponse, CliError> {
    let params = [
      ("grant_type", "refresh_token"),
      ("client_id", client_id),
      ("refresh_token", refresh_token),
    ];
    let response = http_client::post_form(&self.client, format!("{}/oauth/token", self.base_url), &params).await?;
    if !response.status().is_success() {
      return Err(CliError::Message(format!("Token refresh failed: {}", response.status())));
    }
    response.json().await.map_err(CliError::Request)
  }
}

pub struct HttpStoryGateway {
  pub base_url: String,
  pub client: reqwest::Client,
}

fn build_authed_client(base_url: &str, bearer_token: &str) -> Result<Client, CliError> {
  let mut headers = reqwest::header::HeaderMap::new();
  let auth = format!("Bearer {bearer_token}");
  headers.insert(
    reqwest::header::AUTHORIZATION,
    reqwest::header::HeaderValue::from_str(&auth).map_err(|e| CliError::Message(e.to_string()))?,
  );
  Ok(Client::new_with_client(
    base_url,
    reqwest::Client::builder().default_headers(headers).build()?,
  ))
}

#[async_trait::async_trait]
impl StoryGateway for HttpStoryGateway {
  async fn get_story(&self, project: &str, story_number: i64, bearer_token: &str) -> Result<StoryGetBody, CliError> {
    let client = build_authed_client(&self.base_url, bearer_token)?;
    let p = project.parse::<GetStoryByNumberProjectId>().map_err(|e| CliError::Message(e.to_string()))?;
    let s = story_number
      .to_string()
      .parse::<GetStoryByNumberStoryNumber>()
      .map_err(|e| CliError::Message(e.to_string()))?;
    match client.get_story_by_number(&p, &s).await {
      Ok(v) => Ok(StoryGetBody {
        story: serde_json::to_value(v.into_inner().story).map_err(CliError::Json)?,
      }),
      Err(e) => {
        if let Some(status) = e.status() {
          if status == StatusCode::NOT_FOUND { return Err(CliError::Message("Story not found".to_string())); }
          if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(CliError::Message("Unauthorized".to_string()));
          }
          return Err(CliError::Message(format!("Request failed with status {status}")));
        }
        Err(CliError::Message(e.to_string()))
      }
    }
  }

  async fn list_stories(
    &self,
    project: &str,
    filter: &StoryListFilter,
    bearer_token: &str,
  ) -> Result<StoryListBody, CliError> {
    let client = build_authed_client(&self.base_url, bearer_token)?;
    let p = project
      .parse::<ListStoriesProjectId>()
      .map_err(|e| CliError::Message(e.to_string()))?;

    let status: Option<StoryStatus> = if let Some(status_raw) = filter.status.as_deref() {
      Some(serde_json::from_value(serde_json::Value::String(status_raw.to_string()))
        .map_err(|e| CliError::Message(format!("Invalid status: {e}")))?)
    } else {
      None
    };
    let scope: Option<ListStoriesIterationDateScope> = if let Some(scope_raw) = filter.iteration_date_scope.as_deref() {
      Some(serde_json::from_value(serde_json::Value::String(scope_raw.to_string()))
        .map_err(|e| CliError::Message(format!("Invalid iterationDateScope: {e}")))?)
    } else {
      None
    };
    let limit_param: Option<ListStoriesLimit> = if let Some(limit) = filter.limit {
      Some(limit.to_string().parse::<ListStoriesLimit>().map_err(|e| CliError::Message(e.to_string()))?)
    } else {
      None
    };

    match client.list_stories(&p, scope, limit_param.as_ref(), status).await {
      Ok(v) => Ok(StoryListBody {
        stories: v
          .into_inner()
          .stories
          .into_iter()
          .map(serde_json::to_value)
          .collect::<Result<Vec<_>, _>>()
          .map_err(CliError::Json)?,
      }),
      Err(e) => {
        if let Some(status) = e.status() {
          if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(CliError::Message("Unauthorized".to_string()));
          }
          return Err(CliError::Message(format!("Request failed with status {status}")));
        }
        Err(CliError::Message(e.to_string()))
      }
    }
  }

  async fn create_story(&self, project: &str, input: &StoryCreateInput, bearer_token: &str) -> Result<StoryGetBody, CliError> {
    let url = format!("{}/programmatic-api/v1/projects/{project}/stories", self.base_url);
    let response = self
      .client
      .post(url)
      .bearer_auth(bearer_token)
      .json(&serde_json::json!({
        "title": input.title,
        "type": input.r#type,
        "description": input.description,
        "isIcebox": input.is_icebox
      }))
      .send()
      .await?;
    self.parse_story_response(response).await
  }

  async fn update_story(&self, project: &str, story_number: i64, input: &StoryUpdateInput, bearer_token: &str) -> Result<StoryGetBody, CliError> {
    let url = format!("{}/programmatic-api/v1/projects/{project}/stories/{story_number}", self.base_url);
    let response = self
      .client
      .patch(url)
      .bearer_auth(bearer_token)
      .json(&story_update_payload(input))
      .send()
      .await?;
    self.parse_story_response(response).await
  }

  async fn reorder_stories(&self, project: &str, input: &StoryReorderInput, bearer_token: &str) -> Result<StoryListBody, CliError> {
    let url = format!("{}/programmatic-api/v1/projects/{project}/stories/reorder", self.base_url);
    let response = self
      .client
      .post(url)
      .bearer_auth(bearer_token)
      .json(&serde_json::json!({ "orderedIds": input.ordered_ids }))
      .send()
      .await?;
    if response.status().is_success() {
      let body: serde_json::Value = response.json().await?;
      return Ok(StoryListBody {
        stories: body.get("stories").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
      });
    }
    Err(Self::map_error(response.status()))
  }

  async fn create_story_comment(&self, project: &str, story_number: i64, input: &StoryCommentInput, bearer_token: &str) -> Result<serde_json::Value, CliError> {
    let url = format!("{}/programmatic-api/v1/projects/{project}/stories/{story_number}/comments", self.base_url);
    let response = self
      .client
      .post(url)
      .bearer_auth(bearer_token)
      .json(&serde_json::json!({ "body": input.body }))
      .send()
      .await?;
    if response.status().is_success() {
      let body: serde_json::Value = response.json().await?;
      return Ok(body.get("comment").cloned().unwrap_or(body));
    }
    Err(Self::map_error(response.status()))
  }
}

fn story_update_payload(input: &StoryUpdateInput) -> serde_json::Value {
  let mut payload = serde_json::Map::new();
  if let Some(title) = &input.title {
    payload.insert("title".to_string(), title.clone().into());
  }
  if let Some(description) = &input.description {
    payload.insert("description".to_string(), description.clone().into());
  }
  if let Some(story_type) = &input.r#type {
    payload.insert("type".to_string(), story_type.clone().into());
  }
  if let Some(story_point) = &input.story_point {
    payload.insert(
      "storyPoint".to_string(),
      match story_point {
        StoryPointUpdate::Set(point) => (*point).into(),
        StoryPointUpdate::Clear => serde_json::Value::Null,
      },
    );
  }
  if let Some(status) = &input.status {
    payload.insert("status".to_string(), status.clone().into());
  }
  payload.into()
}

impl HttpStoryGateway {
  async fn parse_story_response(&self, response: reqwest::Response) -> Result<StoryGetBody, CliError> {
    if response.status().is_success() {
      let body: serde_json::Value = response.json().await?;
      return Ok(StoryGetBody {
        story: body.get("story").cloned().unwrap_or(body),
      });
    }
    Err(Self::map_error(response.status()))
  }

  fn map_error(status: StatusCode) -> CliError {
    if status == StatusCode::NOT_FOUND {
      return CliError::Message("Story not found".to_string());
    }
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
      return CliError::Message("Unauthorized".to_string());
    }
    CliError::Message(format!("Request failed with status {status}"))
  }
}

#[cfg(test)]
mod tests {
  use super::story_update_payload;
  use crate::application::ports::{StoryPointUpdate, StoryUpdateInput};

  fn empty_update() -> StoryUpdateInput {
    StoryUpdateInput {
      title: None,
      description: None,
      r#type: None,
      story_point: None,
      status: None,
    }
  }

  #[test]
  fn story_update_payload_only_includes_specified_fields() {
    let payload = story_update_payload(&StoryUpdateInput {
      title: Some("Updated title".to_string()),
      ..empty_update()
    });

    assert_eq!(payload, serde_json::json!({ "title": "Updated title" }));
  }

  #[test]
  fn story_update_payload_sets_story_point() {
    let payload = story_update_payload(&StoryUpdateInput {
      story_point: Some(StoryPointUpdate::Set(5)),
      ..empty_update()
    });

    assert_eq!(payload, serde_json::json!({ "storyPoint": 5 }));
  }

  #[test]
  fn story_update_payload_clears_story_point() {
    let payload = story_update_payload(&StoryUpdateInput {
      story_point: Some(StoryPointUpdate::Clear),
      ..empty_update()
    });

    assert_eq!(payload, serde_json::json!({ "storyPoint": null }));
  }
}

pub struct HttpProjectGateway {
  pub base_url: String,
}

#[async_trait::async_trait]
impl ProjectGateway for HttpProjectGateway {
  async fn get_project(&self, project: &str, bearer_token: &str) -> Result<ProjectGetBody, CliError> {
    let client = build_authed_client(&self.base_url, bearer_token)?;
    let p = project
      .parse::<GetProjectProjectId>()
      .map_err(|e| CliError::Message(e.to_string()))?;
    match client.get_project(&p).await {
      Ok(v) => Ok(ProjectGetBody {
        project: serde_json::to_value(v.into_inner().project).map_err(CliError::Json)?,
      }),
      Err(e) => {
        if let Some(status) = e.status() {
          if status == StatusCode::NOT_FOUND { return Err(CliError::Message("Project not found".to_string())); }
          if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(CliError::Message("Unauthorized".to_string()));
          }
          return Err(CliError::Message(format!("Request failed with status {status}")));
        }
        Err(CliError::Message(e.to_string()))
      }
    }
  }
}

pub struct HttpUserGateway {
  pub base_url: String,
  pub client: reqwest::Client,
}

#[async_trait::async_trait]
impl UserGateway for HttpUserGateway {
  async fn whoami(&self, bearer_token: &str) -> Result<WhoamiResponse, CliError> {
    let response = http_client::get_with_bearer(
      &self.client,
      format!("{}/programmatic-api/v1/whoami", self.base_url),
      bearer_token,
    )
    .await?;
    if http_client::is_unauthorized(response.status()) {
      return Err(CliError::Message("Unauthorized".to_string()));
    }
    if !response.status().is_success() {
      return Err(CliError::Message(format!("Request failed with status {}", response.status())));
    }
    response.json().await.map_err(CliError::Request)
  }
}

pub struct HttpVersionGateway {
  pub base_url: String,
}

#[async_trait::async_trait]
impl VersionGateway for HttpVersionGateway {
  async fn get_version(&self, bearer_token: &str) -> Result<CliVersionResponse, CliError> {
    let mut headers = reqwest::header::HeaderMap::new();
    let auth = format!("Bearer {bearer_token}");
    headers.insert(reqwest::header::AUTHORIZATION, reqwest::header::HeaderValue::from_str(&auth).map_err(|e| CliError::Message(e.to_string()))?);
    let client = Client::new_with_client(&self.base_url, reqwest::Client::builder().default_headers(headers).build()?);
    match client.get_cli_version_compatibility().await {
      Ok(v) => {
        let body: CliVersionCompatibilityResponse = v.into_inner();
        Ok(CliVersionResponse {
          api_version: body.api_version,
          min_client_version: body.min_client_version,
        })
      }
      Err(e) => {
        if let Some(status) = e.status() {
          return Err(CliError::Message(format!("Request failed with status {status}")));
        }
        Err(CliError::Message(e.to_string()))
      }
    }
  }
}
