use std::io::Read;
use std::path::Path;

use flate2::read::GzDecoder;
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::CliError;

const REPO: &str = "shwld/tatsumaki";
const TAG_PREFIX: &str = "cli-v";
const CHECKSUMS_ASSET: &str = "sha256sums.txt";

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub tag: String,
    pub version: Version,
}

pub enum Outcome {
    UpToDate(Version),
    Available(Target),
    Updated { from: Version, to: Target },
}

fn msg(text: impl Into<String>) -> CliError {
    CliError::Message(text.into())
}

pub fn parse_tag(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix(TAG_PREFIX)?).ok()
}

fn select_latest(releases: &[Release]) -> Option<Target> {
    releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| {
            parse_tag(&r.tag_name).map(|version| Target {
                tag: r.tag_name.clone(),
                version,
            })
        })
        .max_by(|a, b| a.version.cmp(&b.version))
}

pub fn asset_name(os: &str, arch: &str) -> Result<String, CliError> {
    let os = match os {
        "macos" => "apple-darwin",
        "linux" => "unknown-linux-gnu",
        other => return Err(msg(format!("Unsupported OS for tm update: {other}"))),
    };
    let arch = match arch {
        "aarch64" => "aarch64",
        "x86_64" => "x86_64",
        other => {
            return Err(msg(format!(
                "Unsupported architecture for tm update: {other}"
            )));
        }
    };
    Ok(format!("tm-{arch}-{os}.tar.gz"))
}

pub fn expected_checksum(checksums: &str, asset: &str) -> Result<String, CliError> {
    checksums
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let digest = parts.next()?;
            let name = parts.next()?.trim_start_matches('*');
            (name == asset).then(|| digest.to_ascii_lowercase())
        })
        .next()
        .ok_or_else(|| msg(format!("{asset} is not listed in {CHECKSUMS_ASSET}")))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn verify_checksum(bytes: &[u8], expected: &str) -> Result<(), CliError> {
    let actual = sha256_hex(bytes);
    if actual == expected {
        Ok(())
    } else {
        Err(msg(format!(
            "Checksum mismatch (expected {expected}, got {actual}). Aborting update"
        )))
    }
}

pub fn extract_binary(archive: &[u8]) -> Result<Vec<u8>, CliError> {
    let mut tar = tar::Archive::new(GzDecoder::new(archive));
    for entry in tar.entries()? {
        let mut entry = entry?;
        let is_tm = entry.path()?.file_name().is_some_and(|name| name == "tm");
        if is_tm && entry.header().entry_type().is_file() {
            let mut binary = Vec::new();
            entry.read_to_end(&mut binary)?;
            return Ok(binary);
        }
    }
    Err(msg("tm binary not found in the release archive"))
}

pub fn replace_binary(target: &Path, binary: &[u8]) -> Result<(), CliError> {
    use std::os::unix::fs::PermissionsExt;

    let dir = target
        .parent()
        .ok_or_else(|| msg("Cannot determine the install directory of tm"))?;
    let staged = dir.join(format!(".tm-update-{}", std::process::id()));
    let result = std::fs::write(&staged, binary)
        .and_then(|()| std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755)))
        .and_then(|()| std::fs::rename(&staged, target));
    match result {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = std::fs::remove_file(&staged);
            if err.kind() == std::io::ErrorKind::PermissionDenied {
                Err(msg(format!(
                    "Permission denied writing {}. Re-run with: sudo {} update",
                    target.display(),
                    target.display()
                )))
            } else {
                Err(CliError::Io(err))
            }
        }
    }
}

fn client() -> Result<reqwest::Client, CliError> {
    Ok(reqwest::Client::builder()
        .user_agent(concat!("tm/", env!("CARGO_PKG_VERSION")))
        .build()?)
}

async fn fetch_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, CliError> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(msg(format!(
            "Failed to download {url} (status {})",
            response.status()
        )));
    }
    Ok(response.bytes().await?.to_vec())
}

async fn resolve_target(
    client: &reqwest::Client,
    requested_tag: Option<&str>,
) -> Result<Target, CliError> {
    if let Some(tag) = requested_tag {
        let version = parse_tag(tag).ok_or_else(|| {
            msg(format!(
                "Invalid version tag: {tag} (expected {TAG_PREFIX}X.Y.Z)"
            ))
        })?;
        return Ok(Target {
            tag: tag.to_string(),
            version,
        });
    }
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=100");
    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(msg(format!(
            "Failed to list releases (status {})",
            response.status()
        )));
    }
    let releases: Vec<Release> = response.json().await?;
    select_latest(&releases).ok_or_else(|| msg("No cli-v* release found"))
}

pub async fn run(check_only: bool, requested_tag: Option<&str>) -> Result<Outcome, CliError> {
    let current = Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|e| msg(format!("Invalid current version: {e}")))?;
    let client = client()?;
    let target = resolve_target(&client, requested_tag).await?;

    if requested_tag.is_none() && target.version <= current {
        return Ok(Outcome::UpToDate(current));
    }
    if check_only {
        return Ok(Outcome::Available(target));
    }

    let asset = asset_name(std::env::consts::OS, std::env::consts::ARCH)?;
    let base = format!("https://github.com/{REPO}/releases/download/{}", target.tag);
    let checksums = fetch_bytes(&client, &format!("{base}/{CHECKSUMS_ASSET}")).await?;
    let expected = expected_checksum(&String::from_utf8_lossy(&checksums), &asset)?;
    let archive = fetch_bytes(&client, &format!("{base}/{asset}")).await?;
    verify_checksum(&archive, &expected)?;
    let binary = extract_binary(&archive)?;

    let exe = std::env::current_exe()?.canonicalize()?;
    replace_binary(&exe, &binary)?;
    Ok(Outcome::Updated {
        from: current,
        to: target,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, draft: bool, prerelease: bool) -> Release {
        Release {
            tag_name: tag.to_string(),
            draft,
            prerelease,
        }
    }

    #[test]
    fn select_latest_compares_semver_and_ignores_other_tags() {
        let releases = [
            release("desktop-v9.0.0", false, false),
            release("cli-v0.0.9", false, false),
            release("cli-v0.0.10", false, false),
            release("cli-v0.1.0", true, false),
            release("cli-v0.2.0", false, true),
        ];

        let latest = select_latest(&releases).expect("latest");

        assert_eq!(latest.tag, "cli-v0.0.10");
        assert_eq!(latest.version, Version::new(0, 0, 10));
    }

    #[test]
    fn select_latest_returns_none_without_cli_releases() {
        assert!(select_latest(&[release("desktop-v0.0.2", false, false)]).is_none());
    }

    #[test]
    fn asset_name_maps_supported_platforms() {
        assert_eq!(
            asset_name("macos", "aarch64").unwrap(),
            "tm-aarch64-apple-darwin.tar.gz"
        );
        assert_eq!(
            asset_name("linux", "x86_64").unwrap(),
            "tm-x86_64-unknown-linux-gnu.tar.gz"
        );
        assert!(asset_name("windows", "x86_64").is_err());
        assert!(asset_name("macos", "riscv64").is_err());
    }

    #[test]
    fn expected_checksum_finds_the_asset_line() {
        let sums =
            "AAA111  tm-x86_64-apple-darwin.tar.gz\nbbb222  tm-aarch64-apple-darwin.tar.gz\n";

        assert_eq!(
            expected_checksum(sums, "tm-aarch64-apple-darwin.tar.gz").unwrap(),
            "bbb222"
        );
        assert_eq!(
            expected_checksum(sums, "tm-x86_64-apple-darwin.tar.gz").unwrap(),
            "aaa111"
        );
        assert!(expected_checksum(sums, "missing.tar.gz").is_err());
    }

    #[test]
    fn verify_checksum_rejects_mismatch() {
        let digest = sha256_hex(b"payload");

        assert!(verify_checksum(b"payload", &digest).is_ok());
        assert!(verify_checksum(b"tampered", &digest).is_err());
    }

    fn archive_with(name: &str, content: &[u8]) -> Vec<u8> {
        let mut builder = tar::Builder::new(Vec::new());
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder.append_data(&mut header, name, content).unwrap();
        let tar_bytes = builder.into_inner().unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        std::io::Write::write_all(&mut encoder, &tar_bytes).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn extract_binary_returns_the_tm_entry() {
        assert_eq!(
            extract_binary(&archive_with("tm", b"binary")).unwrap(),
            b"binary"
        );
        assert!(extract_binary(&archive_with("other", b"x")).is_err());
    }

    #[test]
    fn replace_binary_swaps_contents_and_keeps_it_executable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("tm-update-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("tm");
        std::fs::write(&target, b"old").unwrap();

        replace_binary(&target, b"new").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"new");
        assert_eq!(
            std::fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn replace_binary_explains_how_to_retry_with_sudo_when_not_writable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("tm-update-ro-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("tm");
        std::fs::write(&target, b"old").unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();

        let result = replace_binary(&target, b"new");

        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        let err = result.err().map(|e| e.to_string());
        std::fs::remove_dir_all(&dir).unwrap();
        if let Some(text) = err {
            assert!(text.contains("sudo"), "{text}");
        }
        // root can write to read-only directories; there is nothing to assert then.
    }
}
