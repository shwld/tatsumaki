use unicode_normalization::{UnicodeNormalization, is_nfc};

pub const MAX_PATH_BYTES: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathError {
    Empty,
    NotNfc,
    ForbiddenCharacter,
    Absolute,
    TooLong,
    EmptySegment,
    DotSegment,
}

impl PathError {
    /// The same names the server uses (`ArtifactPathError`).
    pub fn code(&self) -> &'static str {
        match self {
            Self::Empty => "EMPTY_PATH",
            Self::NotNfc => "NOT_NFC",
            Self::ForbiddenCharacter => "FORBIDDEN_CHARACTER",
            Self::Absolute => "ABSOLUTE_PATH",
            Self::TooLong => "PATH_TOO_LONG",
            Self::EmptySegment => "EMPTY_SEGMENT",
            Self::DotSegment => "DOT_SEGMENT",
        }
    }
}

pub fn to_nfc(value: &str) -> String {
    value.nfc().collect()
}

/// Validates a manifest path exactly like the server's `validateArtifactPath`:
/// never percent-decoded, must already be NFC. Only the characters the server
/// forbids are rejected (`char::is_control` would also reject C1 controls).
pub fn validate_path(path: &str) -> Result<(), PathError> {
    if path.is_empty() {
        return Err(PathError::Empty);
    }
    if !is_nfc(path) {
        return Err(PathError::NotNfc);
    }
    if path
        .chars()
        .any(|c| c == '\\' || ('\u{0}'..='\u{1f}').contains(&c) || c == '\u{7f}')
    {
        return Err(PathError::ForbiddenCharacter);
    }
    if path.starts_with('/') {
        return Err(PathError::Absolute);
    }
    if path.len() > MAX_PATH_BYTES {
        return Err(PathError::TooLong);
    }
    for segment in path.split('/') {
        if segment.is_empty() {
            return Err(PathError::EmptySegment);
        }
        if segment == "." || segment == ".." {
            return Err(PathError::DotSegment);
        }
    }
    Ok(())
}

/// Paths that collide when compared case-insensitively.
pub fn case_insensitive_duplicates<'a>(paths: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    use std::collections::{BTreeSet, HashMap};
    let mut seen: HashMap<String, &str> = HashMap::new();
    let mut duplicates = BTreeSet::new();
    for path in paths {
        match seen.get(&path.to_lowercase()) {
            Some(existing) => {
                duplicates.insert((*existing).to_string());
                duplicates.insert(path.to_string());
            }
            None => {
                seen.insert(path.to_lowercase(), path);
            }
        }
    }
    duplicates.into_iter().collect()
}

/// A path that is both a file and a directory prefix of another path (`a` and
/// `a/b`) cannot be written to a file system.
pub fn file_directory_conflicts<'a>(paths: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    use std::collections::BTreeSet;
    let paths: Vec<&str> = paths.into_iter().collect();
    let mut directories = BTreeSet::new();
    for path in &paths {
        let mut end = 0;
        for (index, _) in path.match_indices('/') {
            directories.insert(path[..index].to_lowercase());
            end = index;
        }
        let _ = end;
    }
    paths
        .iter()
        .filter(|path| directories.contains(&path.to_lowercase()))
        .map(|path| path.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifact::read_fixture;

    #[test]
    fn matches_the_shared_body_path_fixture() {
        let fixture = read_fixture("artifact-body-paths.json");
        for input in fixture["valid"].as_array().unwrap() {
            let input = input.as_str().unwrap();
            assert_eq!(validate_path(input), Ok(()), "valid {input:?}");
        }
        for case in fixture["invalid"].as_array().unwrap() {
            let input = case["input"].as_str().unwrap();
            let expected = case["error"].as_str().unwrap();
            let actual = validate_path(input).expect_err(&format!("invalid {input:?}"));
            assert_eq!(actual.code(), expected, "invalid {input:?}");
        }
        for input in fixture["validC1Control"].as_array().unwrap() {
            let input = input.as_str().unwrap();
            assert_eq!(validate_path(input), Ok(()), "C1 control {input:?}");
        }
    }

    #[test]
    fn limits_the_path_to_utf8_bytes() {
        let max = read_fixture("artifact-body-paths.json")["maxBytes"]
            .as_u64()
            .unwrap() as usize;
        assert_eq!(max, MAX_PATH_BYTES);
        assert_eq!(validate_path(&"a".repeat(max)), Ok(()));
        assert_eq!(validate_path(&"a".repeat(max + 1)), Err(PathError::TooLong));
        // 3 bytes per character: 171 characters are 513 bytes
        assert_eq!(validate_path(&"あ".repeat(171)), Err(PathError::TooLong));
        assert_eq!(validate_path(&"あ".repeat(170)), Ok(()));
    }

    #[test]
    fn normalizes_nfd_to_the_nfc_the_server_requires() {
        let nfd = "e\u{301}.txt";
        assert_eq!(validate_path(nfd), Err(PathError::NotNfc));
        assert_eq!(validate_path(&to_nfc(nfd)), Ok(()));
        assert_eq!(to_nfc(nfd), "\u{e9}.txt");
    }

    #[test]
    fn finds_case_insensitive_duplicates() {
        assert_eq!(
            case_insensitive_duplicates(["a/Index.html", "a/index.html", "b"]),
            vec!["a/Index.html".to_string(), "a/index.html".to_string()]
        );
        assert!(case_insensitive_duplicates(["a", "b"]).is_empty());
    }

    #[test]
    fn finds_file_and_directory_conflicts() {
        assert_eq!(
            file_directory_conflicts(["a", "a/b", "c"]),
            vec!["a".to_string()]
        );
        assert_eq!(
            file_directory_conflicts(["A", "a/b"]),
            vec!["A".to_string()]
        );
        assert!(file_directory_conflicts(["a/b", "a/c", "ab"]).is_empty());
    }
}
