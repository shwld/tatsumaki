# tatsumaki CLI (`tm`)

## Download (GitHub Releases)

Release assets are published on tags matching `cli-v<semver>` (for example `cli-v0.0.5`).

1. Download your platform tarball and `sha256sums.txt` from GitHub Releases.
2. Verify checksum.
3. Extract and run `tm`.

```bash
# macOS arm64 example
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/tm-aarch64-apple-darwin.tar.gz
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/sha256sums.txt
sha256sum -c sha256sums.txt --ignore-missing
tar -xzf tm-aarch64-apple-darwin.tar.gz
./tm --version
```

```bash
# Linux x64 example
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/tm-x86_64-unknown-linux-gnu.tar.gz
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/sha256sums.txt
sha256sum -c sha256sums.txt --ignore-missing
tar -xzf tm-x86_64-unknown-linux-gnu.tar.gz
./tm --version
```

```bash
# macOS x64 example
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/tm-x86_64-apple-darwin.tar.gz
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/sha256sums.txt
sha256sum -c sha256sums.txt --ignore-missing
tar -xzf tm-x86_64-apple-darwin.tar.gz
./tm --version
```

```bash
# Linux arm64 example
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/tm-aarch64-unknown-linux-gnu.tar.gz
curl -LO https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.5/sha256sums.txt
sha256sum -c sha256sums.txt --ignore-missing
tar -xzf tm-aarch64-unknown-linux-gnu.tar.gz
./tm --version
```

## Build

```bash
cargo build --manifest-path apps/cli/Cargo.toml --release
```

## Base URL configuration

Resolution order:

1. `--base-url`
2. `TATSUMAKI_BASE_URL`
3. `~/.config/tatsumaki/config.toml`

```bash
tm config set base-url https://tatsumaki.example.com
tm config get base-url
tm config show
```

`http://` is allowed only for loopback hosts (`localhost`, `127.0.0.1`, `::1`).

## Auth

```bash
tm login
tm whoami
tm logout
```

`tm login` uses OAuth Authorization Code + PKCE with a localhost callback.
Tokens are stored in OS keyring.

## Story get

`tm story get` uses the saved token from `tm login`.
You can still override with `TATSUMAKI_TOKEN`.

```bash
TATSUMAKI_TOKEN=... tm story get --project <project-id> 95
TATSUMAKI_TOKEN=... tm --json story get --project <project-id> 95
```

## Story list

```bash
tm story list --project <project-id>
tm story list --project <project-id> --status Unstarted
tm story list --project <project-id> --iteration current
tm story list --project <project-id> --status Started --limit 10
tm --json story list --project <project-id>
```

## Story create

```bash
tm story create --project <project-id> --title "New story" --type feature --description "details"
tm story create --project <project-id> --title "Release v1" --type release --description "release marker"
tm --json story create --project <project-id> --title "New story" --type bug --description "details" --is-icebox
```

## Story update

```bash
tm story update --project <project-id> 95 --title "Updated title"
tm --json story update --project <project-id> 95 --description "Updated description" --type release
tm story update --project <project-id> 95 --story-point 5
tm story update --project <project-id> 95 --clear-story-point
```

`--story-point` must follow the project's configured point scale.

## Story status

```bash
tm story status --project <project-id> 95 --status Started
tm --json story status --project <project-id> 95 --status Finished
```

## Story comment

```bash
tm story comment --project <project-id> 95 --body "Looks good"
tm --json story comment --project <project-id> 95 --body "Please recheck"
```

## Story reorder

```bash
tm story reorder --project <project-id> --ordered-id <story-id-1> --ordered-id <story-id-2>
tm --json story reorder --project <project-id> --ordered-id <story-id-1> --ordered-id <story-id-2>
```

## Project get

```bash
tm project get <project-id>
tm --json project get <project-id>
```

## Artifacts

An artifact is a built directory (HTML, CSS, JavaScript, images, fonts) stored in a project. Every upload creates an immutable version; the web app shows the latest or a pinned version in a sandboxed preview.

```bash
tm artifact create --project <project-id> --title "My app" --path ./dist
tm artifact update --project <project-id> <artifact-id> --path ./dist --base-version 3
tm artifact update --project <project-id> <artifact-id> --title "New title"
tm artifact get --project <project-id> <artifact-id> [--files]
tm artifact list --project <project-id> [--archived]
tm artifact versions --project <project-id> <artifact-id>
tm artifact download --project <project-id> <artifact-id> [--version 2] --out ./restored
tm artifact archive --project <project-id> <artifact-id>
tm artifact unarchive --project <project-id> <artifact-id>
```

`create` and `update` print the artifact id, the version, the latest URL and the pinned URL of that version. `--json` prints the same data with a stable shape.

### The directory and `tatsumaki-artifact.json`

The directory must contain `tatsumaki-artifact.json` at its root:

```json
{
  "schemaVersion": 1,
  "entrypoint": "index.html",
  "exclude": ["**/*.map", ".DS_Store"]
}
```

- `entrypoint` is an `.html` file inside the directory. Unknown fields are rejected.
- `exclude` globs are matched against the path relative to the directory, with `/` separators and case-sensitively. `*` and `?` do not cross `/`, `**` does. A pattern **without a slash only matches at the top level** (`node_modules` does not match `a/node_modules`; use `**/node_modules/**`). `!` negation is not supported. The manifest itself and the entrypoint cannot be excluded.
- Nothing is skipped silently. The command fails and lists every problem if the directory contains a symbolic link, a socket or pipe, a secret-looking file (`.env*`, `*secret*`, `*credential*`, `*token*`, `*.pem`, `*.key`, `.git/`, `.ssh/`, ...), a file type that is not allowed, or a name that Windows cannot hold. Exclude such files or remove them.
- Allowed file types: `html css js mjs json txt svg png jpg jpeg gif webp avif ico woff woff2 ttf otf mp3 wav ogg mp4 webm`. Source maps (`.map`), `.md`, `.xml`, `.pdf` and extensionless files are not allowed, so most projects want `"exclude": ["**/*.map", ".DS_Store"]`.
- Limits per version: 1,000 files, 25 MiB per file, 50 MiB in total, 512 bytes per path. Paths are normalized to Unicode NFC.
- The artifact runs in a sandbox with no network, cookies or storage: use hash routing (`#/route`) instead of `history.pushState`, and bundle data instead of calling `fetch`.

### Updating and conflicts

`update --path` needs `--base-version`, the version you built from. If someone published a newer version, the command fails with exit code 7 and nothing changes; there is no force option. To go back to an old version, `download` it and `update` from that directory. Uploading a directory identical to the latest version succeeds and reports `noop` without creating a version.

If both `--path` and `--title` are given, the files are published first. If the title change then fails, the new version is already published, the output says so, and you can retry with only `--title`.

### Download

`download` writes into a directory that does not exist or is empty and never overwrites a file. The manifest from the server is validated first (paths, sizes, case collisions, Windows-incompatible names, tree digest), every file is checked against its sha256, and the files are written to a hidden `.tm-artifact-download-*` directory next to the target and moved into place only when everything is intact. If the process is killed, such a leftover directory can be deleted safely.

### Retries and exit codes

Requests are retried up to three times with backoff on network errors, `429` and `5xx`; uploads are idempotent. Large artifacts are uploaded file by file, one at a time (a few hundred files take seconds; 1,000 files of 50 MiB in total depends on your connection). Exit code `7` means a conflict (a newer version exists); the other codes are the same as for `tm story`.

## Desktop refetch

`tm desktop refetch` sends a local IPC request to a running desktop process.

```bash
# default type=stories
tm desktop refetch --project <project-id>

# full screen-level refetch
tm desktop refetch --project <project-id> --type screen

# custom timeout (ms)
tm desktop refetch --project <project-id> --timeout-ms 5000
```

Endpoint resolution order:

1. `TATSUMAKI_DESKTOP_IPC_ENDPOINT` (for local/dev override)
2. Desktop `desktop-config.json` (`desktopIpcEndpoint`)
3. OS default endpoint (`unix socket` / `windows named pipe`)

Auth token resolution order:

1. `TATSUMAKI_DESKTOP_IPC_AUTH_TOKEN` (local/dev override)
2. Desktop `desktop-config.json` (`desktopIpcAuthToken`)

Refetch behavior:

- `--type stories`: panel/story list queries only
- `--type screen`: bootstrap + panel/story list queries

## MCP parity

| MCP tool | tm command |
| --- | --- |
| `get_project` | `tm project get` |
| `list_stories` | `tm story list` |
| `get_story` | `tm story get` |
| `create_story` | `tm story create` |
| `update_story` | `tm story update` |
| `update_story_status` | `tm story status` |
| `create_story_comment` | `tm story comment` |
| `reorder_stories` | `tm story reorder` |

## Release Procedure

1. Update `apps/cli/crates/tm/Cargo.toml` `version`.
2. Merge to `main`.
3. Push a tag `cli-v<version>`.
4. Confirm `.github/workflows/cli-release.yml` is green.
5. Confirm release assets include:
`tm-aarch64-apple-darwin.tar.gz`, `tm-x86_64-apple-darwin.tar.gz`, `tm-x86_64-unknown-linux-gnu.tar.gz`, `tm-aarch64-unknown-linux-gnu.tar.gz`, `sha256sums.txt`.
6. If the release contains a compatibility break, update the server-side `minClientVersion` in `apps/web/src/presentation/routes/cli/v1.ts` and deploy web before announcing the CLI release.

## Compatibility Policy

- CLI asks `/programmatic-api/v1/version` at startup for `apiVersion` and `minClientVersion`.
- If `tm` version is lower than `minClientVersion`, CLI shows a warning and continues (fail-soft).
- If version parsing fails on client or server response, CLI warns and continues (fail-soft).
- SemVer comparison uses Rust `semver` crate semantics.
- Pre-release versions follow SemVer precedence (for example `0.2.0-rc.1` is lower than `0.2.0`).
