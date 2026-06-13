use crate::CliError;

const TOKEN_SERVICE: &str = "tatsumaki-cli";
const TOKEN_ACCOUNT: &str = "default";

fn entry() -> Result<keyring::Entry, CliError> {
    keyring::Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT)
        .map_err(|e| CliError::Message(e.to_string()))
}

pub fn load_secret() -> Result<String, CliError> {
    entry()?
        .get_password()
        .map_err(|_| CliError::Message("Not logged in. Run: tm login".to_string()))
}

pub fn save_secret(raw: &str) -> Result<(), CliError> {
    entry()?
        .set_password(raw)
        .map_err(|e| CliError::Message(e.to_string()))
}

pub fn clear_secret() -> Result<(), CliError> {
    let _ = entry()?.delete_credential();
    Ok(())
}
