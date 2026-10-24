use sha2::{Digest, Sha256};

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    to_hex(&Sha256::digest(bytes))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DigestEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

/// sha256 over `"{path}\0{size}\0{sha256}\n"` for every file, ordered by the
/// UTF-8 bytes of the path (the same value as `computeArtifactTreeDigest`).
pub fn tree_digest(entries: &[DigestEntry]) -> String {
    let mut ordered: Vec<&DigestEntry> = entries.iter().collect();
    ordered.sort_by(|a, b| a.path.as_bytes().cmp(b.path.as_bytes()));
    let mut hasher = Sha256::new();
    for entry in ordered {
        hasher.update(format!("{}\0{}\0{}\n", entry.path, entry.size, entry.sha256).as_bytes());
    }
    to_hex(&hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifact::read_fixture;

    #[test]
    fn matches_the_shared_tree_digest_fixture_in_any_order() {
        let fixture = read_fixture("artifact-tree-digest.json");
        let mut entries: Vec<DigestEntry> = fixture["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| DigestEntry {
                path: f["path"].as_str().unwrap().to_string(),
                size: f["size"].as_u64().unwrap(),
                sha256: f["sha256"].as_str().unwrap().to_string(),
            })
            .collect();
        let expected = fixture["treeDigest"].as_str().unwrap();

        assert_eq!(tree_digest(&entries), expected);
        entries.reverse();
        assert_eq!(tree_digest(&entries), expected);
    }

    #[test]
    fn hashes_empty_input() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
