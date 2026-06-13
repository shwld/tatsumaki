use crate::{application::ports::{TokenCache, TokenStore}, CliError};
use crate::infrastructure::keyring_store::{clear_secret, load_secret, save_secret};

pub struct KeyringTokenStore;

impl TokenStore for KeyringTokenStore {
  fn load(&self) -> Result<TokenCache, CliError> {
    let raw = load_secret()?;
    serde_json::from_str(&raw).map_err(CliError::Json)
  }

  fn save(&self, cache: &TokenCache) -> Result<(), CliError> {
    let raw = serde_json::to_string(cache).map_err(CliError::Json)?;
    save_secret(&raw)
  }

  fn clear(&self) -> Result<(), CliError> {
    clear_secret()
  }
}
