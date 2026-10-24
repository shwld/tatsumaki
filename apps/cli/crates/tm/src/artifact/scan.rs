use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

use super::{
    content_type::content_type_for_path,
    digest::{DigestEntry, tree_digest},
    download::windows_incompatibility,
    manifest::{ArtifactManifest, MANIFEST_FILE_NAME, parse_manifest},
    path::{case_insensitive_duplicates, file_directory_conflicts, to_nfc, validate_path},
    sensitive::is_sensitive_path,
};

pub const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_FILES: usize = 1000;

#[derive(Debug, Clone)]
pub struct ScannedFile {
    /// Canonical NFC path as it goes into the upload manifest.
    pub path: String,
    pub size: u64,
    pub sha256: String,
    /// Where the bytes are read from at upload time.
    pub source: PathBuf,
}

#[derive(Debug)]
pub struct ScanResult {
    pub entrypoint: String,
    pub files: Vec<ScannedFile>,
    pub tree_digest: String,
    pub total_bytes: u64,
}

/// Everything wrong with the directory, reported together. Nothing is skipped
/// silently: a single problem fails the whole scan.
#[derive(Debug)]
pub struct ScanFailure {
    pub problems: Vec<String>,
}

impl std::fmt::Display for ScanFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "The directory cannot be uploaded:")?;
        for problem in &self.problems {
            writeln!(f, "  - {problem}")?;
        }
        Ok(())
    }
}

fn fail(problem: impl Into<String>) -> ScanFailure {
    ScanFailure {
        problems: vec![problem.into()],
    }
}

pub fn scan_directory(root: &Path) -> Result<ScanResult, ScanFailure> {
    let root_metadata =
        fs::metadata(root).map_err(|e| fail(format!("cannot read {}: {e}", root.display())))?;
    if !root_metadata.is_dir() {
        return Err(fail(format!("{} is not a directory", root.display())));
    }

    let manifest_path = root.join(MANIFEST_FILE_NAME);
    let manifest_is_file = fs::symlink_metadata(&manifest_path)
        .map(|m| m.file_type().is_file())
        .unwrap_or(false);
    if !manifest_is_file {
        return Err(fail(format!(
            "{MANIFEST_FILE_NAME} is required at the root of {} and must be a regular file",
            root.display()
        )));
    }
    let manifest_bytes = fs::read(&manifest_path)
        .map_err(|e| fail(format!("cannot read {MANIFEST_FILE_NAME}: {e}")))?;
    let manifest = parse_manifest(&manifest_bytes).map_err(fail)?;

    let mut collector = Collector {
        manifest: &manifest,
        problems: Vec::new(),
        files: Vec::new(),
        total_bytes: 0,
    };
    collector.walk(root, "")?;

    let Collector {
        mut problems,
        mut files,
        total_bytes,
        ..
    } = collector;

    if !files.iter().any(|f| f.path == manifest.entrypoint) {
        problems.push(format!(
            "entrypoint \"{}\" was not found as a regular file in the directory",
            manifest.entrypoint
        ));
    }

    let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    let duplicates = case_insensitive_duplicates(paths.iter().copied());
    if !duplicates.is_empty() {
        problems.push(format!(
            "paths that are the same after Unicode normalization or ignoring case: {}",
            duplicates.join(", ")
        ));
    }
    let conflicts = file_directory_conflicts(paths.iter().copied());
    if !conflicts.is_empty() {
        problems.push(format!(
            "paths that are both a file and a directory: {}",
            conflicts.join(", ")
        ));
    }

    if !problems.is_empty() {
        return Err(ScanFailure { problems });
    }

    files.sort_by(|a, b| a.path.as_bytes().cmp(b.path.as_bytes()));
    let entries: Vec<DigestEntry> = files
        .iter()
        .map(|f| DigestEntry {
            path: f.path.clone(),
            size: f.size,
            sha256: f.sha256.clone(),
        })
        .collect();

    Ok(ScanResult {
        entrypoint: manifest.entrypoint.clone(),
        tree_digest: tree_digest(&entries),
        files,
        total_bytes,
    })
}

struct Collector<'a> {
    manifest: &'a ArtifactManifest,
    problems: Vec<String>,
    files: Vec<ScannedFile>,
    total_bytes: u64,
}

impl Collector<'_> {
    fn walk(&mut self, directory: &Path, prefix: &str) -> Result<(), ScanFailure> {
        let entries = fs::read_dir(directory).map_err(|e| {
            fail(format!(
                "cannot read directory {}: {e}",
                directory.display()
            ))
        })?;
        let mut entries: Vec<_> = entries.collect::<Result<_, _>>().map_err(|e| {
            fail(format!(
                "cannot read directory {}: {e}",
                directory.display()
            ))
        })?;
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let os_name = entry.file_name();
            let Some(name) = os_name.to_str() else {
                self.problems.push(format!(
                    "{} has a file name that is not valid UTF-8",
                    entry.path().display()
                ));
                continue;
            };
            let relative = to_nfc(&if prefix.is_empty() {
                name.to_string()
            } else {
                format!("{prefix}/{name}")
            });
            let is_manifest = relative == MANIFEST_FILE_NAME;
            let excluded = !is_manifest && self.manifest.exclude.is_excluded(&relative);

            let file_type = entry
                .file_type()
                .map_err(|e| fail(format!("cannot inspect {}: {e}", entry.path().display())))?;

            if file_type.is_dir() {
                if !excluded {
                    self.walk(&entry.path(), &relative)?;
                }
                continue;
            }
            if excluded {
                continue;
            }
            if !file_type.is_file() {
                let kind = if file_type.is_symlink() {
                    "a symbolic link"
                } else {
                    "not a regular file"
                };
                self.problems.push(format!(
                    "{relative} is {kind}; remove it or add it to \"exclude\""
                ));
                continue;
            }
            self.add_file(relative, entry.path())?;
        }
        Ok(())
    }

    fn add_file(&mut self, relative: String, source: PathBuf) -> Result<(), ScanFailure> {
        if self.files.len() >= MAX_FILES {
            return Err(fail(format!("more than {MAX_FILES} files")));
        }
        if let Err(error) = validate_path(&relative) {
            self.problems
                .push(format!("{relative}: invalid path ({})", error.code()));
            return Ok(());
        }
        // Stricter than the server on purpose: whatever this CLI uploads, it
        // can download again on any platform.
        if let Some(reason) = windows_incompatibility(&relative) {
            self.problems.push(format!(
                "{relative}: {reason}; rename it or add it to \"exclude\""
            ));
            return Ok(());
        }
        if is_sensitive_path(&relative) {
            self.problems.push(format!(
                "{relative} looks like a secret or credential file and is never uploaded; remove it or add it to \"exclude\""
            ));
            return Ok(());
        }
        if content_type_for_path(&relative).is_none() {
            self.problems.push(format!(
                "{relative} has a file type that is not allowed; remove it or add it to \"exclude\" (for example \"**/*.map\" or \".DS_Store\")"
            ));
            return Ok(());
        }

        let (size, sha256) =
            hash_file(&source).map_err(|e| fail(format!("cannot read {relative}: {e}")))?;
        if size > MAX_FILE_BYTES {
            self.problems.push(format!(
                "{relative} is larger than {} MiB",
                MAX_FILE_BYTES / 1024 / 1024
            ));
            return Ok(());
        }
        self.total_bytes += size;
        if self.total_bytes > MAX_TOTAL_BYTES {
            return Err(fail(format!(
                "the directory is larger than {} MiB in total",
                MAX_TOTAL_BYTES / 1024 / 1024
            )));
        }
        self.files.push(ScannedFile {
            path: relative,
            size,
            sha256,
            source,
        });
        Ok(())
    }
}

fn hash_file(path: &Path) -> std::io::Result<(u64, String)> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        size += read as u64;
        hasher.update(&buffer[..read]);
    }
    let digest = hasher.finalize();
    Ok((size, digest.iter().map(|b| format!("{b:02x}")).collect()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn write(root: &Path, relative: &str, content: &[u8]) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn site(manifest: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), MANIFEST_FILE_NAME, manifest.as_bytes());
        write(dir.path(), "index.html", b"<html></html>");
        dir
    }

    const BASIC: &str = r#"{"schemaVersion":1,"entrypoint":"index.html"}"#;

    fn problems(result: Result<ScanResult, ScanFailure>) -> String {
        result.expect_err("scan should fail").to_string()
    }

    #[test]
    fn collects_files_in_utf8_byte_order_with_a_stable_tree_digest() {
        let dir = site(BASIC);
        write(dir.path(), "assets/app.js", b"console.log(1)");
        write(dir.path(), "empty.txt", b"");
        fs::create_dir_all(dir.path().join("empty-dir")).unwrap();

        let result = scan_directory(dir.path()).unwrap();

        let paths: Vec<&str> = result.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "assets/app.js",
                "empty.txt",
                "index.html",
                MANIFEST_FILE_NAME
            ]
        );
        assert_eq!(result.entrypoint, "index.html");
        assert_eq!(result.tree_digest.len(), 64);
        let again = scan_directory(dir.path()).unwrap();
        assert_eq!(again.tree_digest, result.tree_digest);
    }

    #[test]
    fn always_includes_the_manifest_even_when_a_pattern_is_close() {
        let dir = site(
            r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["tatsumaki-artifact.jso"]}"#,
        );
        let result = scan_directory(dir.path()).unwrap();
        assert!(result.files.iter().any(|f| f.path == MANIFEST_FILE_NAME));
    }

    #[test]
    fn requires_a_regular_manifest_at_the_root() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "index.html", b"x");
        assert!(problems(scan_directory(dir.path())).contains(MANIFEST_FILE_NAME));

        let link_dir = tempfile::tempdir().unwrap();
        write(link_dir.path(), "real.json", BASIC.as_bytes());
        symlink(
            link_dir.path().join("real.json"),
            link_dir.path().join(MANIFEST_FILE_NAME),
        )
        .unwrap();
        assert!(scan_directory(link_dir.path()).is_err());
    }

    #[test]
    fn rejects_a_path_that_is_not_a_directory() {
        let dir = site(BASIC);
        assert!(scan_directory(&dir.path().join("index.html")).is_err());
        assert!(scan_directory(&dir.path().join("missing")).is_err());
    }

    #[test]
    fn rejects_symlinks_instead_of_skipping_them() {
        let dir = site(BASIC);
        symlink(dir.path().join("index.html"), dir.path().join("link.html")).unwrap();
        let message = problems(scan_directory(dir.path()));
        assert!(
            message.contains("link.html") && message.contains("symbolic link"),
            "{message}"
        );
    }

    #[test]
    fn rejects_a_symlinked_directory_but_not_when_it_is_excluded() {
        let dir = site(BASIC);
        let other = tempfile::tempdir().unwrap();
        symlink(other.path(), dir.path().join("linked")).unwrap();
        assert!(scan_directory(dir.path()).is_err());

        let excluded =
            site(r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["linked"]}"#);
        symlink(other.path(), excluded.path().join("linked")).unwrap();
        assert!(scan_directory(excluded.path()).is_ok());
    }

    #[test]
    fn rejects_named_pipes() {
        let dir = site(BASIC);
        let pipe = dir.path().join("pipe.txt");
        let status = std::process::Command::new("mkfifo").arg(&pipe).status();
        if status.map(|s| s.success()).unwrap_or(false) {
            let message = problems(scan_directory(dir.path()));
            assert!(message.contains("pipe.txt"), "{message}");
        }
    }

    #[test]
    fn reports_every_secret_and_unsupported_file_together() {
        let dir = site(BASIC);
        write(dir.path(), ".env", b"A=1");
        write(dir.path(), "keys/server.pem", b"x");
        write(dir.path(), "app.js.map", b"{}");
        write(dir.path(), "notes.md", b"#");
        let message = problems(scan_directory(dir.path()));
        for expected in [".env", "keys/server.pem", "app.js.map", "notes.md"] {
            assert!(
                message.contains(expected),
                "{expected} missing from: {message}"
            );
        }
        assert!(message.contains("exclude"));
    }

    #[test]
    fn excluded_secrets_and_unsupported_files_are_not_collected() {
        let dir = site(
            r#"{"schemaVersion":1,"entrypoint":"index.html","exclude":["**/*.map",".env",".DS_Store","node_modules/**"]}"#,
        );
        write(dir.path(), "app.js.map", b"{}");
        write(dir.path(), ".env", b"A=1");
        write(dir.path(), ".DS_Store", b"x");
        write(dir.path(), "node_modules/pkg/index.js", b"x");
        let result = scan_directory(dir.path()).unwrap();
        let paths: Vec<&str> = result.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["index.html", MANIFEST_FILE_NAME]);
    }

    #[test]
    fn rejects_names_that_could_not_be_downloaded_again_on_windows() {
        let dir = site(BASIC);
        write(dir.path(), "con.txt", b"x");
        write(dir.path(), "what?.txt", b"x");
        write(dir.path(), "trailing.", b"x");
        let message = problems(scan_directory(dir.path()));
        for expected in ["con.txt", "what?.txt", "trailing."] {
            assert!(
                message.contains(expected),
                "{expected} missing from: {message}"
            );
        }
        assert!(message.contains("Windows"));
    }

    #[test]
    fn fails_when_the_entrypoint_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), MANIFEST_FILE_NAME, BASIC.as_bytes());
        assert!(problems(scan_directory(dir.path())).contains("entrypoint"));
    }

    #[test]
    fn normalizes_nfd_file_names_to_nfc_paths() {
        let dir = site(BASIC);
        write(dir.path(), "e\u{301}.txt", b"x");
        let result = scan_directory(dir.path()).unwrap();
        assert!(result.files.iter().any(|f| f.path == "\u{e9}.txt"));
    }

    #[test]
    fn rejects_names_that_collide_after_normalization_or_case() {
        let dir = site(BASIC);
        write(dir.path(), "Readme.txt", b"a");
        write(dir.path(), "readme.txt", b"b");
        // Some file systems fold case and keep only one file.
        if dir.path().join("Readme.txt").exists() && fs::read_dir(dir.path()).unwrap().count() == 4
        {
            assert!(problems(scan_directory(dir.path())).contains("Readme.txt"));
        }
    }

    #[test]
    fn rejects_a_file_whose_name_is_a_directory_prefix_ignoring_case() {
        let dir = site(BASIC);
        write(dir.path(), "docs.txt", b"x");
        // A case-insensitive file system cannot hold both names.
        if fs::create_dir(dir.path().join("DOCS.TXT")).is_ok() {
            write(dir.path(), "DOCS.TXT/inner.txt", b"y");
            let message = problems(scan_directory(dir.path()));
            assert!(message.contains("both a file and a directory"), "{message}");
        }
    }

    #[test]
    fn rejects_files_over_the_per_file_limit() {
        let dir = site(BASIC);
        let big = vec![0u8; (MAX_FILE_BYTES + 1) as usize];
        write(dir.path(), "big.txt", &big);
        assert!(problems(scan_directory(dir.path())).contains("big.txt"));
    }

    #[test]
    fn rejects_a_total_over_the_limit() {
        let dir = site(BASIC);
        let chunk = vec![0u8; MAX_FILE_BYTES as usize];
        write(dir.path(), "a.txt", &chunk);
        write(dir.path(), "b.txt", &chunk);
        write(dir.path(), "c.txt", &chunk);
        assert!(problems(scan_directory(dir.path())).contains("in total"));
    }

    #[test]
    fn rejects_more_than_the_file_count_limit() {
        let dir = site(BASIC);
        for index in 0..MAX_FILES {
            write(dir.path(), &format!("f/{index}.txt"), b"x");
        }
        assert!(problems(scan_directory(dir.path())).contains("more than"));
    }

    #[test]
    fn rejects_non_utf8_file_names() {
        use std::os::unix::ffi::OsStrExt;
        let dir = site(BASIC);
        let name = std::ffi::OsStr::from_bytes(b"bad-\xff.txt");
        if fs::write(dir.path().join(name), b"x").is_ok() {
            assert!(problems(scan_directory(dir.path())).contains("UTF-8"));
        }
    }
}
