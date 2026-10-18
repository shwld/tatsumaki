use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use super::{
    digest::{DigestEntry, sha256_hex, tree_digest},
    path::{case_insensitive_duplicates, file_directory_conflicts, validate_path},
    scan::{MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES},
};
use crate::application::ports::ArtifactFileInfo;

/// Everything the server's manifest has to satisfy before anything is written.
/// The server is not trusted: a broken or hostile answer must not be able to
/// write outside the output directory or fill the disk.
pub fn validate_download_plan(
    files: &[ArtifactFileInfo],
    expected_tree_digest: &str,
) -> Result<(), String> {
    if files.is_empty() {
        return Err("the version has no files".to_string());
    }
    if files.len() > MAX_FILES {
        return Err(format!("the version lists more than {MAX_FILES} files"));
    }

    let mut problems = Vec::new();
    let mut total = 0u64;
    for file in files {
        if let Err(error) = validate_path(&file.path) {
            problems.push(format!("{}: invalid path ({})", file.path, error.code()));
            continue;
        }
        if let Some(reason) = windows_incompatibility(&file.path) {
            problems.push(format!("{}: {reason}", file.path));
        }
        if file.size > MAX_FILE_BYTES {
            problems.push(format!("{}: larger than the per-file limit", file.path));
        }
        total = total.saturating_add(file.size);
    }
    if total > MAX_TOTAL_BYTES {
        problems.push("the total size is larger than the limit".to_string());
    }

    let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
    let duplicates = case_insensitive_duplicates(paths.iter().copied());
    if !duplicates.is_empty() {
        problems.push(format!(
            "paths that differ only by case: {}",
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
        return Err(problems.join("; "));
    }

    let entries: Vec<DigestEntry> = files
        .iter()
        .map(|f| DigestEntry {
            path: f.path.clone(),
            size: f.size,
            sha256: f.sha256.clone(),
        })
        .collect();
    if tree_digest(&entries) != expected_tree_digest {
        return Err("the file list does not match the version's tree digest".to_string());
    }
    Ok(())
}

const RESERVED_WINDOWS_NAMES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Names that cannot be created (or silently become something else) on
/// Windows. They are refused on every platform so a download is portable.
pub fn windows_incompatibility(path: &str) -> Option<String> {
    for segment in path.split('/') {
        if segment.ends_with('.') || segment.ends_with(' ') {
            return Some("a name ends with a dot or a space".to_string());
        }
        if let Some(bad) = segment
            .chars()
            .find(|c| matches!(c, ':' | '<' | '>' | '"' | '|' | '?' | '*'))
        {
            return Some(format!(
                "a name contains \"{bad}\", which Windows does not allow"
            ));
        }
        let stem = segment.split('.').next().unwrap_or(segment).to_lowercase();
        if RESERVED_WINDOWS_NAMES.contains(&stem.as_str()) {
            return Some(format!("\"{segment}\" is a reserved name on Windows"));
        }
    }
    None
}

#[derive(Debug, PartialEq, Eq)]
pub enum OutputTarget {
    /// The directory does not exist yet.
    Missing,
    /// The directory exists and is empty.
    EmptyDirectory,
}

/// The destination must not exist or must be an empty directory so that no
/// existing file can ever be overwritten.
pub fn check_output_target(out: &Path) -> Result<OutputTarget, String> {
    match fs::symlink_metadata(out) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(OutputTarget::Missing),
        Err(error) => Err(format!("cannot inspect {}: {error}", out.display())),
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!("{} exists and is not a directory", out.display()));
            }
            let empty = fs::read_dir(out)
                .map_err(|e| format!("cannot read {}: {e}", out.display()))?
                .next()
                .is_none();
            if empty {
                Ok(OutputTarget::EmptyDirectory)
            } else {
                Err(format!(
                    "{} is not empty; choose a new or empty directory",
                    out.display()
                ))
            }
        }
    }
}

pub const STAGING_PREFIX: &str = ".tm-artifact-download-";

/// A directory the files are written into first. It is removed on drop unless
/// it was moved into place, so a failure leaves nothing behind.
pub struct Staging {
    path: PathBuf,
    armed: bool,
}

impl Staging {
    pub fn create_beside(out: &Path) -> Result<Self, String> {
        let parent = match out.parent() {
            Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
            _ => PathBuf::from("."),
        };
        fs::create_dir_all(&parent)
            .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        let suffix: u64 = rand::random();
        let path = parent.join(format!("{STAGING_PREFIX}{suffix:016x}"));
        fs::create_dir(&path).map_err(|e| format!("cannot create {}: {e}", path.display()))?;
        Ok(Self { path, armed: true })
    }

    pub fn write_file(&self, relative: &str, bytes: &[u8]) -> Result<(), String> {
        let mut target = self.path.clone();
        for segment in relative.split('/') {
            target.push(segment);
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            // Never an executable bit, whatever the server says.
            options.mode(0o644);
        }
        let mut file = options
            .open(&target)
            .map_err(|e| format!("cannot write {relative}: {e}"))?;
        file.write_all(bytes)
            .map_err(|e| format!("cannot write {relative}: {e}"))
    }

    /// Moves the staged files to `out`. A missing `out` is replaced by the
    /// staging directory in one rename. An empty existing `out` receives the
    /// entries one by one, each only if its name is still free.
    pub fn commit(mut self, out: &Path, target: OutputTarget) -> Result<(), String> {
        match target {
            OutputTarget::Missing => {
                fs::rename(&self.path, out)
                    .map_err(|e| format!("cannot move the download to {}: {e}", out.display()))?;
                self.armed = false;
            }
            OutputTarget::EmptyDirectory => {
                let entries = fs::read_dir(&self.path)
                    .map_err(|e| format!("cannot read the staged files: {e}"))?;
                for entry in entries {
                    let entry = entry.map_err(|e| format!("cannot read the staged files: {e}"))?;
                    let destination = out.join(entry.file_name());
                    if fs::symlink_metadata(&destination).is_ok() {
                        return Err(format!(
                            "{} appeared while downloading; nothing was overwritten",
                            destination.display()
                        ));
                    }
                    fs::rename(entry.path(), &destination)
                        .map_err(|e| format!("cannot move into {}: {e}", out.display()))?;
                }
            }
        }
        Ok(())
    }
}

impl Drop for Staging {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

/// Checks the bytes of one downloaded file against its manifest entry.
pub fn verify_file(file: &ArtifactFileInfo, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 != file.size {
        return Err(format!("{}: size does not match the manifest", file.path));
    }
    if sha256_hex(bytes) != file.sha256 {
        return Err(format!("{}: sha256 does not match the manifest", file.path));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, content: &[u8]) -> ArtifactFileInfo {
        ArtifactFileInfo {
            path: path.to_string(),
            size: content.len() as u64,
            sha256: sha256_hex(content),
            content_type: "text/plain".to_string(),
        }
    }

    fn digest_of(files: &[ArtifactFileInfo]) -> String {
        tree_digest(
            &files
                .iter()
                .map(|f| DigestEntry {
                    path: f.path.clone(),
                    size: f.size,
                    sha256: f.sha256.clone(),
                })
                .collect::<Vec<_>>(),
        )
    }

    #[test]
    fn accepts_a_valid_manifest_with_the_matching_tree_digest() {
        let files = vec![file("index.html", b"<html>"), file("a/b.js", b"x")];
        assert_eq!(validate_download_plan(&files, &digest_of(&files)), Ok(()));
    }

    #[test]
    fn rejects_hostile_or_broken_manifests_before_anything_is_written() {
        let hostile: Vec<(Vec<ArtifactFileInfo>, &str)> = vec![
            (vec![file("../escape.txt", b"x")], "invalid path"),
            (vec![file("/abs.txt", b"x")], "invalid path"),
            (vec![file("a\\b.txt", b"x")], "invalid path"),
            (
                vec![file("a.txt", b"x"), file("A.TXT", b"y")],
                "differ only by case",
            ),
            (
                vec![file("a", b"x"), file("a/b.txt", b"y")],
                "both a file and a directory",
            ),
            (vec![file("con.txt", b"x")], "reserved name"),
            (vec![file("nul", b"x")], "reserved name"),
            (vec![file("a:stream.txt", b"x")], "Windows does not allow"),
            (vec![file("trailing.", b"x")], "ends with a dot"),
            (vec![file("trailing ", b"x")], "ends with a dot"),
            (vec![file("what?.txt", b"x")], "Windows does not allow"),
        ];
        for (files, expected) in hostile {
            let error = validate_download_plan(&files, &digest_of(&files)).unwrap_err();
            assert!(error.contains(expected), "{files:?} -> {error}");
        }
        assert!(validate_download_plan(&[], "x").is_err());
    }

    #[test]
    fn rejects_sizes_beyond_the_limits() {
        let mut big = file("big.txt", b"x");
        big.size = MAX_FILE_BYTES + 1;
        assert!(validate_download_plan(&[big.clone()], &digest_of(&[big])).is_err());

        let mut a = file("a.txt", b"x");
        a.size = MAX_FILE_BYTES;
        let mut b = file("b.txt", b"x");
        b.size = MAX_FILE_BYTES;
        let mut c = file("c.txt", b"x");
        c.size = MAX_FILE_BYTES;
        let files = vec![a, b, c];
        assert!(validate_download_plan(&files, &digest_of(&files)).is_err());
    }

    #[test]
    fn rejects_a_file_list_that_does_not_match_the_tree_digest() {
        let files = vec![file("index.html", b"x")];
        let error = validate_download_plan(&files, &"0".repeat(64)).unwrap_err();
        assert!(error.contains("tree digest"));
    }

    #[test]
    fn output_must_be_missing_or_an_empty_directory() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            check_output_target(&dir.path().join("new")),
            Ok(OutputTarget::Missing)
        );
        assert_eq!(
            check_output_target(dir.path()),
            Ok(OutputTarget::EmptyDirectory)
        );

        fs::write(dir.path().join("keep.txt"), b"x").unwrap();
        assert!(
            check_output_target(dir.path())
                .unwrap_err()
                .contains("not empty")
        );
        assert!(
            check_output_target(&dir.path().join("keep.txt"))
                .unwrap_err()
                .contains("not a directory")
        );
    }

    #[test]
    fn writes_into_a_new_directory_in_one_move() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");
        let staging = Staging::create_beside(&out).unwrap();
        staging.write_file("index.html", b"<html>").unwrap();
        staging.write_file("assets/app.js", b"js").unwrap();
        staging.commit(&out, OutputTarget::Missing).unwrap();

        assert_eq!(fs::read(out.join("assets/app.js")).unwrap(), b"js");
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(STAGING_PREFIX))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn fills_an_existing_empty_directory_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");
        fs::create_dir(&out).unwrap();
        let staging = Staging::create_beside(&out).unwrap();
        staging.write_file("index.html", b"<html>").unwrap();
        staging.commit(&out, OutputTarget::EmptyDirectory).unwrap();
        assert_eq!(fs::read(out.join("index.html")).unwrap(), b"<html>");
    }

    #[test]
    fn never_overwrites_a_file_that_appeared_in_the_meantime() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");
        fs::create_dir(&out).unwrap();
        let staging = Staging::create_beside(&out).unwrap();
        staging.write_file("index.html", b"new").unwrap();
        fs::write(out.join("index.html"), b"precious").unwrap();

        let error = staging
            .commit(&out, OutputTarget::EmptyDirectory)
            .unwrap_err();

        assert!(error.contains("nothing was overwritten"));
        assert_eq!(fs::read(out.join("index.html")).unwrap(), b"precious");
    }

    #[test]
    fn dropping_the_staging_directory_removes_everything() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("site");
        {
            let staging = Staging::create_beside(&out).unwrap();
            staging.write_file("a/b.txt", b"x").unwrap();
        }
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
        assert!(!out.exists());
    }

    #[test]
    fn refuses_to_write_the_same_file_twice() {
        let dir = tempfile::tempdir().unwrap();
        let staging = Staging::create_beside(&dir.path().join("site")).unwrap();
        staging.write_file("a.txt", b"x").unwrap();
        assert!(staging.write_file("a.txt", b"y").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn written_files_are_never_executable() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let staging = Staging::create_beside(&dir.path().join("site")).unwrap();
        staging.write_file("run.sh.txt", b"x").unwrap();
        let mode = fs::metadata(staging.path.join("run.sh.txt"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o111, 0);
    }

    #[test]
    fn verifies_size_and_digest_of_downloaded_bytes() {
        let entry = file("a.txt", b"hello");
        assert_eq!(verify_file(&entry, b"hello"), Ok(()));
        assert!(verify_file(&entry, b"hell").is_err());
        assert!(verify_file(&entry, b"hellp").is_err());
    }
}
