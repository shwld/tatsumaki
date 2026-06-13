use std::{fs, path::PathBuf};

use crate::CliError;

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct ConfigFile {
    pub base_url: Option<String>,
}

pub fn config_path() -> Result<PathBuf, CliError> {
    let base = dirs::config_dir()
        .ok_or_else(|| CliError::Message("Failed to resolve config directory".to_string()))?;
    Ok(base.join("tatsumaki").join("config.toml"))
}

pub fn read_config() -> Result<Option<ConfigFile>, CliError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)?;
    let config: ConfigFile = toml::from_str(&raw)?;
    Ok(Some(config))
}

pub fn write_config(config: &ConfigFile) -> Result<(), CliError> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = toml::to_string(config).map_err(|e| CliError::Message(e.to_string()))?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn read_raw_config() -> Result<String, CliError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(toml::to_string_pretty(&ConfigFile::default()).unwrap_or_default());
    }
    Ok(fs::read_to_string(path)?)
}
