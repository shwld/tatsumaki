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
    pub is_icebox: Option<bool>,
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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoryBlockerAction {
    Add,
    Remove,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoryBlockerRelation {
    BlockedBy,
    Blocks,
}
impl StoryBlockerRelation {
    pub fn as_api_str(self) -> &'static str {
        match self {
            Self::BlockedBy => "blockedBy",
            Self::Blocks => "blocks",
        }
    }
}
#[derive(Debug, Clone, Copy)]
pub struct StoryBlockerInput {
    pub action: StoryBlockerAction,
    pub relation: StoryBlockerRelation,
    pub target_story_number: i64,
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
    async fn change_story_blocker(
        &self,
        project: &str,
        story_number: i64,
        input: &StoryBlockerInput,
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

/// Server view of an artifact. Only the fields the CLI prints are kept, so
/// the CLI output does not change when the server adds fields.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactInfo {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub archived_at: Option<String>,
    pub latest_version: Option<i64>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactVersionInfo {
    pub version: i64,
    pub entrypoint: String,
    pub tree_digest: String,
    pub file_count: i64,
    pub total_bytes: i64,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactFileInfo {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub content_type: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactDetailBody {
    pub artifact: ArtifactInfo,
    pub latest_version: Option<ArtifactVersionDetailBody>,
}

/// A version together with its file manifest.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactVersionDetailBody {
    #[serde(flatten)]
    pub version: ArtifactVersionInfo,
    #[serde(default)]
    pub files: Vec<ArtifactFileInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ArtifactVersionFilesBody {
    pub version: ArtifactVersionInfo,
    pub files: Vec<ArtifactFileInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UploadFileEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

/// Request body of `POST .../artifact-uploads`. `artifact_id` and
/// `base_version` are set together for an update; `title` for a new artifact.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUploadInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_version: Option<i64>,
    pub entrypoint: String,
    pub tree_digest: String,
    pub files: Vec<UploadFileEntry>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UploadSession {
    pub session_id: String,
    pub artifact_id: String,
    pub status: String,
    #[serde(default)]
    pub uploaded_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CreateUploadOutcome {
    Session(UploadSession),
    /// The tree equals the latest version; nothing was created.
    Noop { artifact_id: String, version: i64 },
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeBody {
    pub artifact_id: String,
    pub version: i64,
}

#[async_trait::async_trait]
pub trait ArtifactGateway {
    async fn list_artifacts(
        &self,
        project: &str,
        archived: bool,
        bearer_token: &str,
    ) -> Result<Vec<ArtifactInfo>, CliError>;
    async fn get_artifact(
        &self,
        project: &str,
        artifact_id: &str,
        bearer_token: &str,
    ) -> Result<ArtifactDetailBody, CliError>;
    async fn update_artifact_title(
        &self,
        project: &str,
        artifact_id: &str,
        title: &str,
        bearer_token: &str,
    ) -> Result<ArtifactInfo, CliError>;
    async fn set_artifact_archived(
        &self,
        project: &str,
        artifact_id: &str,
        archived: bool,
        bearer_token: &str,
    ) -> Result<ArtifactInfo, CliError>;
    async fn list_artifact_versions(
        &self,
        project: &str,
        artifact_id: &str,
        bearer_token: &str,
    ) -> Result<Vec<ArtifactVersionInfo>, CliError>;
    async fn get_artifact_version(
        &self,
        project: &str,
        artifact_id: &str,
        version: i64,
        bearer_token: &str,
    ) -> Result<ArtifactVersionFilesBody, CliError>;
    async fn create_upload(
        &self,
        project: &str,
        input: &CreateUploadInput,
        idempotency_key: &str,
        bearer_token: &str,
    ) -> Result<CreateUploadOutcome, CliError>;
    async fn put_upload_file(
        &self,
        project: &str,
        session_id: &str,
        path: &str,
        bytes: Vec<u8>,
        bearer_token: &str,
    ) -> Result<(), CliError>;
    async fn finalize_upload(
        &self,
        project: &str,
        session_id: &str,
        bearer_token: &str,
    ) -> Result<FinalizeBody, CliError>;
    /// Downloads one file; reads at most `max_bytes` and fails beyond that.
    async fn download_file(
        &self,
        project: &str,
        artifact_id: &str,
        version: i64,
        path: &str,
        max_bytes: u64,
        bearer_token: &str,
    ) -> Result<Vec<u8>, CliError>;
}
