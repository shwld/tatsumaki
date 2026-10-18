//! Client side of the Artifact feature. Every rule here mirrors
//! `apps/web/src/domain/artifacts/*`; the tests read the fixtures in
//! `apps/web/test/fixtures` that the TypeScript tests also read, so the two
//! implementations cannot drift apart unnoticed.

pub mod content_type;
pub mod digest;
pub mod download;
pub mod manifest;
pub mod path;
pub mod scan;
pub mod sensitive;
pub mod url;

#[cfg(test)]
pub(crate) fn read_fixture(name: &str) -> serde_json::Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../web/test/fixtures")
        .join(name);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read fixture {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("invalid fixture {name}: {e}"))
}
