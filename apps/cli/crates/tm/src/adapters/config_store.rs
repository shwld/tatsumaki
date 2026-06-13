use crate::{application::ports::ConfigStore, CliError};
use crate::infrastructure::config_file::{ConfigFile, read_config, read_raw_config, write_config};

pub struct FileConfigStore;

impl ConfigStore for FileConfigStore {
  fn load_base_url(&self) -> Result<Option<String>, CliError> {
    Ok(read_config()?.and_then(|c| c.base_url))
  }

  fn save_base_url(&self, base_url: &str) -> Result<(), CliError> {
    write_config(&ConfigFile {
      base_url: Some(base_url.to_string()),
    })
  }

  fn show_raw(&self) -> Result<String, CliError> {
    read_raw_config()
  }
}
