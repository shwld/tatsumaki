const SENSITIVE_EXTENSIONS: [&str; 5] = ["pem", "key", "p12", "pfx", "crt"];
const SENSITIVE_FILE_NAMES: [&str; 4] = [".netrc", ".npmrc", ".envrc", ".pypirc"];
const SENSITIVE_NAME_FRAGMENTS: [&str; 3] = ["secret", "credential", "token"];
const SENSITIVE_DIRECTORIES: [&str; 5] = [".git", ".ssh", ".gnupg", ".aws", ".kube"];

/// Port of `isSensitiveArtifactPath` (which mirrors scripts/config-guard.sh).
/// The CLI may be stricter than the server but never looser.
pub fn is_sensitive_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    let segments: Vec<&str> = lower.split('/').collect();
    let file_name = segments.last().copied().unwrap_or("");
    let directories = &segments[..segments.len().saturating_sub(1)];

    if directories
        .iter()
        .any(|d| SENSITIVE_DIRECTORIES.contains(d))
    {
        return true;
    }
    if file_name == ".git" {
        return true;
    }
    if file_name == "config.json" && directories.last() == Some(&".docker") {
        return true;
    }
    if file_name == ".env" || file_name.starts_with(".env.") {
        return true;
    }
    if SENSITIVE_FILE_NAMES.contains(&file_name) {
        return true;
    }
    if SENSITIVE_NAME_FRAGMENTS
        .iter()
        .any(|f| file_name.contains(f))
    {
        return true;
    }
    match file_name.rfind('.') {
        Some(dot) => SENSITIVE_EXTENSIONS.contains(&&file_name[dot + 1..]),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifact::read_fixture;

    #[test]
    fn matches_the_shared_sensitive_path_fixture() {
        let fixture = read_fixture("artifact-sensitive-paths.json");
        for path in fixture["sensitive"].as_array().unwrap() {
            let path = path.as_str().unwrap();
            assert!(is_sensitive_path(path), "should flag {path}");
        }
        for path in fixture["allowed"].as_array().unwrap() {
            let path = path.as_str().unwrap();
            assert!(!is_sensitive_path(path), "should allow {path}");
        }
    }
}
