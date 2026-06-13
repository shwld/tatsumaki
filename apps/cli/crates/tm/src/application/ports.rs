use serde::{Deserialize, Serialize};

use crate::CliError;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenCache {
    pub client_id: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<u64>,
    pub obtained_at_unix: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryGetBody {
    pub story: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryListBody {
    pub stories: Vec<serde_json::Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryCreateInput {
    pub title: String,
    pub r#type: String,
    pub description: String,
    pub is_icebox: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryUpdateInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub r#type: Option<String>,
    pub story_point: Option<StoryPointUpdate>,
    pub status: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StoryPointUpdate {
    Set(i64),
    Clear,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryReorderInput {
    pub ordered_ids: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryCommentInput {
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectGetBody {
    pub project: serde_json::Value,
}

#[derive(Debug, Clone, Default)]
pub struct StoryListFilter {
    pub status: Option<String>,
    pub iteration_date_scope: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhoamiResponse {
    pub id: String,
    pub email: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliVersionResponse {
    #[serde(rename = "apiVersion")]
    pub api_version: String,
    #[serde(rename = "minClientVersion")]
    pub min_client_version: String,
}

pub trait TokenStore {
    fn load(&self) -> Result<TokenCache, CliError>;
    fn save(&self, cache: &TokenCache) -> Result<(), CliError>;
    fn clear(&self) -> Result<(), CliError>;
}

pub trait ConfigStore {
    fn load_base_url(&self) -> Result<Option<String>, CliError>;
    fn save_base_url(&self, base_url: &str) -> Result<(), CliError>;
    fn show_raw(&self) -> Result<String, CliError>;
}

#[async_trait::async_trait]
pub trait AuthGateway {
    async fn register_client(&self, redirect_uri: &str) -> Result<String, CliError>;
    async fn exchange_code(
        &self,
        client_id: &str,
        code: &str,
        redirect_uri: &str,
        verifier: &str,
    ) -> Result<OAuthTokenResponse, CliError>;
    async fn refresh_token(
        &self,
        client_id: &str,
        refresh_token: &str,
    ) -> Result<OAuthTokenResponse, CliError>;
}

#[async_trait::async_trait]
pub trait StoryGateway {
    async fn get_story(
        &self,
        project: &str,
        story_number: i64,
        bearer_token: &str,
    ) -> Result<StoryGetBody, CliError>;

    async fn list_stories(
        &self,
        project: &str,
        filter: &StoryListFilter,
        bearer_token: &str,
    ) -> Result<StoryListBody, CliError>;
    async fn create_story(
        &self,
        project: &str,
        input: &StoryCreateInput,
        bearer_token: &str,
    ) -> Result<StoryGetBody, CliError>;
    async fn update_story(
        &self,
        project: &str,
        story_number: i64,
        input: &StoryUpdateInput,
        bearer_token: &str,
    ) -> Result<StoryGetBody, CliError>;
    async fn reorder_stories(
        &self,
        project: &str,
        input: &StoryReorderInput,
        bearer_token: &str,
    ) -> Result<StoryListBody, CliError>;
    async fn create_story_comment(
        &self,
        project: &str,
        story_number: i64,
        input: &StoryCommentInput,
        bearer_token: &str,
    ) -> Result<serde_json::Value, CliError>;
}

#[async_trait::async_trait]
pub trait ProjectGateway {
    async fn get_project(
        &self,
        project: &str,
        bearer_token: &str,
    ) -> Result<ProjectGetBody, CliError>;
}

#[async_trait::async_trait]
pub trait UserGateway {
    async fn whoami(&self, bearer_token: &str) -> Result<WhoamiResponse, CliError>;
}

#[async_trait::async_trait]
pub trait VersionGateway {
    async fn get_version(&self, bearer_token: &str) -> Result<CliVersionResponse, CliError>;
}
