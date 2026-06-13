use reqwest::StatusCode;

use crate::CliError;

pub async fn post_json(
    client: &reqwest::Client,
    url: String,
    payload: serde_json::Value,
) -> Result<reqwest::Response, CliError> {
    Ok(client.post(url).json(&payload).send().await?)
}

pub async fn post_form(
    client: &reqwest::Client,
    url: String,
    params: &[(&str, &str)],
) -> Result<reqwest::Response, CliError> {
    Ok(client.post(url).form(params).send().await?)
}

pub async fn get_with_bearer(
    client: &reqwest::Client,
    url: String,
    token: &str,
) -> Result<reqwest::Response, CliError> {
    Ok(client.get(url).bearer_auth(token).send().await?)
}

pub fn is_unauthorized(status: StatusCode) -> bool {
    status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN
}
