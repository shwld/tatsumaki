use globset::{Glob, GlobBuilder, GlobSet, GlobSetBuilder};
use serde::Deserialize;

use super::path::{to_nfc, validate_path};

pub const MANIFEST_FILE_NAME: &str = "tatsumaki-artifact.json";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawManifest {
    schema_version: u64,
    entrypoint: String,
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Debug)]
pub struct ArtifactManifest {
    /// Canonical (NFC) path of the HTML entrypoint.
    pub entrypoint: String,
    pub exclude: ExcludeMatcher,
}

/// Case-sensitive globs matched against the NFC, `/`-separated path relative
/// to the artifact root. `*` and `?` never cross `/`, `**` does. A pattern
/// without a slash only matches at the root (it is not a gitignore).
#[derive(Debug)]
pub struct ExcludeMatcher {
    set: GlobSet,
}

impl ExcludeMatcher {
    fn build(patterns: &[String]) -> Result<Self, String> {
        let mut builder = GlobSetBuilder::new();
        for pattern in patterns {
            if pattern.starts_with('!') {
                return Err(format!(
                    "exclude pattern \"{pattern}\": negation is not supported"
                ));
            }
            let trimmed = pattern.trim_end_matches('/');
            if trimmed.is_empty() {
                return Err("exclude pattern must not be empty".to_string());
            }
            let glob: Glob = GlobBuilder::new(trimmed)
                .literal_separator(true)
                .case_insensitive(false)
                .build()
                .map_err(|e| format!("exclude pattern \"{pattern}\" is invalid: {e}"))?;
            builder.add(glob);
        }
        let set = builder.build().map_err(|e| e.to_string())?;
        Ok(Self { set })
    }

    pub fn is_excluded(&self, relative_path: &str) -> bool {
        self.set.is_match(relative_path)
    }
}

pub fn parse_manifest(bytes: &[u8]) -> Result<ArtifactManifest, String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return Err(format!(
            "{MANIFEST_FILE_NAME} must not start with a byte order mark"
        ));
    }
    let raw: RawManifest = serde_json::from_slice(bytes)
        .map_err(|e| format!("{MANIFEST_FILE_NAME} is invalid: {e}"))?;
    if raw.schema_version != 1 {
        return Err(format!(
            "{MANIFEST_FILE_NAME}: schemaVersion must be 1 (got {})",
            raw.schema_version
        ));
    }

    let entrypoint = to_nfc(&raw.entrypoint);
    validate_path(&entrypoint).map_err(|e| {
        format!(
            "{MANIFEST_FILE_NAME}: entrypoint \"{}\" is invalid ({})",
            raw.entrypoint,
            e.code()
        )
    })?;
    if !entrypoint.to_lowercase().ends_with(".html") {
        return Err(format!(
            "{MANIFEST_FILE_NAME}: entrypoint must be an .html file"
        ));
    }

    let exclude =
        ExcludeMatcher::build(&raw.exclude).map_err(|e| format!("{MANIFEST_FILE_NAME}: {e}"))?;
    if exclude.is_excluded(MANIFEST_FILE_NAME) {
        return Err(format!(
            "{MANIFEST_FILE_NAME}: an exclude pattern matches {MANIFEST_FILE_NAME} itself, which is always uploaded"
        ));
    }
    if exclude.is_excluded(&entrypoint) {
        return Err(format!(
            "{MANIFEST_FILE_NAME}: the entrypoint \"{entrypoint}\" is excluded"
        ));
    }

    Ok(ArtifactManifest {
        entrypoint,
        exclude,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> Result<ArtifactManifest, String> {
        parse_manifest(json.as_bytes())
    }

    #[test]
    fn parses_a_minimal_and_a_full_manifest() {
        assert_eq!(
            parse(r#"{"schemaVersion":1,"entrypoint":"index.html"}"#)
                .unwrap()
                .entrypoint,
            "index.html"
        );
        let full =
            parse(r#"{"schemaVersion":1,"entrypoint":"app/index.html","exclude":["**/*.map"]}"#)
                .unwrap();
        assert!(full.exclude.is_excluded("assets/app.js.map"));
        assert!(!full.exclude.is_excluded("assets/app.js"));
    }

    #[test]
    fn rejects_bad_manifests() {
        let bad = [
            ("", "empty"),
            ("not json", "not json"),
            (
                r#"{"schemaVersion":2,"entrypoint":"index.html"}"#,
                "version 2",
            ),
            (
                r#"{"schemaVersion":"1","entrypoint":"index.html"}"#,
                "string version",
            ),
            (
                r#"{"schemaVersion":1.0,"entrypoint":"index.html"}"#,
                "float version",
            ),
            (r#"{"entrypoint":"index.html"}"#, "missing version"),
            (r#"{"schemaVersion":1}"#, "missing entrypoint"),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","extra":1}"#,
                "unknown field",
            ),
            (
                r#"{"schemaVersion":1,"schemaVersion":1,"entrypoint":"index.html"}"#,
                "duplicate key",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":"a"}"#,
                "exclude not array",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":[1]}"#,
                "exclude not strings",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"./index.html"}"#,
                "dot segment",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"/index.html"}"#,
                "absolute",
            ),
            (r#"{"schemaVersion":1,"entrypoint":"app.js"}"#, "not html"),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["!a"]}"#,
                "negation",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["["]}"#,
                "invalid glob",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["/"]}"#,
                "empty pattern",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["*.json"]}"#,
                "matches the manifest",
            ),
            (
                r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["index.html"]}"#,
                "excludes entrypoint",
            ),
        ];
        for (json, label) in bad {
            assert!(parse(json).is_err(), "{label} should be rejected");
        }
    }

    #[test]
    fn rejects_a_byte_order_mark() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(br#"{"schemaVersion":1,"entrypoint":"index.html"}"#);
        assert!(parse_manifest(&bytes).is_err());
    }

    #[test]
    fn normalizes_the_entrypoint_to_nfc() {
        let manifest = parse("{\"schemaVersion\":1,\"entrypoint\":\"e\u{301}.html\"}").unwrap();
        assert_eq!(manifest.entrypoint, "\u{e9}.html");
    }

    #[test]
    fn exclude_globs_have_documented_semantics() {
        let manifest = parse(
            r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["node_modules","**/*.map","tmp/**","dist/","*.log","{a,b}.txt","Case.txt"]}"#,
        )
        .unwrap();
        let ex = &manifest.exclude;
        // a bare name only matches at the root
        assert!(ex.is_excluded("node_modules"));
        assert!(!ex.is_excluded("a/node_modules"));
        // ** crosses directories, * does not
        assert!(ex.is_excluded("a/b/c.map"));
        assert!(ex.is_excluded("x.log"));
        assert!(!ex.is_excluded("a/x.log"));
        // dir/** matches the contents but not the directory itself
        assert!(ex.is_excluded("tmp/a/b"));
        assert!(!ex.is_excluded("tmp"));
        // a trailing slash is ignored
        assert!(ex.is_excluded("dist"));
        // alternation, and case sensitivity
        assert!(ex.is_excluded("a.txt") && ex.is_excluded("b.txt"));
        assert!(ex.is_excluded("Case.txt") && !ex.is_excluded("case.txt"));
    }
}
