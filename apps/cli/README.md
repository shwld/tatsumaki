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

## Project resolution

`tm story`, `tm label`, `tm epic`, `tm artifact`, `tm project get` and `tm desktop refetch` resolve the project in this order:

1. `--project` (for `tm project get`, the positional project ID)
2. `TATSUMAKI_PROJECT_ID`
3. `project_id` in the nearest `tatsumaki.toml`, searched from the current directory upward

```toml
# tatsumaki.toml (commit it at the repository root)
project_id = "01ABC..."
```

Unknown keys and invalid TOML are errors. `tm config show` prints both the global config and the `tatsumaki.toml` in use.

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
tm story list --project <project-id> --icebox
tm story list --project <project-id> --archived
tm story list --project <project-id> --status Started --limit 10
tm --json story list --project <project-id>
```

The table shows `section` (Done / Current / Backlog / Icebox), `iteration` (number, `-` when unassigned) and `position`, in the order of the UI panels (Done, Current, Backlog, Icebox; Done newest status change first, the others by position), so you can compare it with the UI directly. `--limit` still selects stories by position before they are shown in this order. `--json` includes `section` and `iterationNumber` on every story.

## Story archive

Unstarted and rejected stories can be archived without deleting their history.

```bash
tm story archive --project <project-id> 95
tm story unarchive --project <project-id> 95
```

## Story create

```bash
tm story create --project <project-id> --title "New story" --type feature --description "details"
tm story create --project <project-id> --title "Release v1" --type release --description "release marker"
tm --json story create --project <project-id> --title "New story" --type bug --description "details" --is-icebox
tm story create --project <project-id> --title "Estimated" --type feature --description "details" --story-point 3 --after 120
```

`--story-point` sets the estimate at creation. A position (`--to-top`, `--to-end`, `--after <story-number>`, `--before <story-number>`; at most one) places the new story among the stories outside the Icebox; it cannot be combined with `--is-icebox`.

## Story update

```bash
tm story update --project <project-id> 95 --title "Updated title"
tm --json story update --project <project-id> 95 --description "Updated description" --type release
tm story update --project <project-id> 95 --story-point 5
tm story update --project <project-id> 95 --clear-story-point
tm story update --project <project-id> 95 --no-icebox
tm story update --project <project-id> 95 --icebox
```

`--story-point` must follow the project's configured point scale.

`--icebox` / `--no-icebox` move a story between the Icebox and the Backlog without changing its position. Only an Unstarted story without an iteration can be moved to the Icebox; otherwise the server's reason is printed (HTTP 400).

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

## Story block / unblock

`--by` registers the story as blocked by another story; `--blocks` registers it as blocking another story. Registering an existing blocker or removing a missing one is not an error. Self-references and cycles are rejected.

```bash
tm story block --project <project-id> 328 --by 325
tm story block --project <project-id> 325 --blocks 328
tm story unblock --project <project-id> 328 --by 325
tm --json story block --project <project-id> 328 --by 325
```

`tm story get` lists the stories involved under `blockingStories` (blocking this story) and `blockedStories` (blocked by this story), with their number, title and status.

### Taking a story out of the Icebox at a position

`tm story update --no-icebox` puts the story first by default. Add one position flag to choose where it lands; the other stories keep their relative order.

```bash
tm story update --project <project-id> 120 --no-icebox --to-end
tm story update --project <project-id> 120 --no-icebox --after 95
tm story update --project <project-id> 120 --no-icebox --before 95
```

A position flag without `--no-icebox` repositions a story that is already outside the Icebox. A story that stays in the Icebox, an Icebox reference story, a reference story of another project or the story itself are rejected without any change.

## Story reorder

Changes story priority (order). By story number: `tm story reorder <story-number>` with one of `--to-top`, `--to-end`, `--after <story-number>`, `--before <story-number>` moves that story among the stories outside the Icebox, and every other story keeps its relative order. The story and the reference story must be outside the Icebox; stories of other projects are not found.

```bash
tm story reorder --project <project-id> 120 --to-end
tm story reorder --project <project-id> 120 --after 95
```

By ID: `--ordered-id` is repeated from highest to lowest priority and takes the internal story ID (the `id` field of `tm --json story list`), not the story number. Only the listed stories are rearranged, and only among the positions they already occupy; unlisted stories keep their positions. To move one story to a place, prefer the story-number form above.

Reorder changes priority only. Status, Icebox and iteration assignment are untouched, so it does not release a Current assignment; use `tm story unassign-iteration` for that.

```bash
tm story reorder --project <project-id> --ordered-id <story-id-1> --ordered-id <story-id-2>
tm --json story reorder --project <project-id> --ordered-id <story-id-1> --ordered-id <story-id-2>
```

## Story iteration unassign

Removes an Unstarted story from the iteration it was explicitly assigned to, so it returns to the Backlog and follows normal priority and auto-planning. Only the iteration assignment changes; status, position, points and owners are untouched. Unlike `tm story reorder`, which only changes priority and never changes the iteration.

```bash
tm story unassign-iteration --project <project-id> 389
tm --json story unassign-iteration --project <project-id> 389
```

- Re-running on a story with no iteration succeeds and reports `changed: false`.
- Started or later stories, archived stories, other projects' stories and unknown story numbers are rejected (409 / 404) without any change.
- A story can still be pulled into Current again by auto-planning if its priority and the iteration's capacity allow it.

## Project get

```bash
tm project get <project-id>
tm --json project get <project-id>
```

## Labels and strategy planning (epics)

An epic is the strategy plan of one label: purpose, success criteria, owner, planned period and outcome. Its name is the label's name, and its stories are the stories that carry the label. Project owners and members can change plans; viewers can only read them.

```bash
tm label list --project <project-id>
tm label create --project <project-id> --name "Onboarding" --color "#3366ff"
tm label deletion-impact --project <project-id> <label-id>
tm epic list --project <project-id>
tm epic get --project <project-id> <label-id>
tm epic progress --project <project-id>                # ON epics with progress
tm epic progress --project <project-id> <label-id>     # one epic with its stories
tm epic enable --project <project-id> <label-id>
tm epic update --project <project-id> <label-id> --revision 1 \
  --description "Make the first week easy" --success-criteria "80% finish setup" \
  --owner <user-id> --planned-start 2026-11-01 --planned-end 2026-12-31 --outcome unevaluated
tm epic disable --project <project-id> <label-id> --revision 2
tm epic enable --project <project-id> <label-id> --revision 3
```

- `enable` creates the epic the first time. `disable` keeps the plan, and `enable --revision` restores it; the label stays on its stories either way.
- Writes take the `revision` you last read. If someone changed the plan in between, the command fails with exit code 7 and nothing changes; read it again and retry.
- The planned period is two calendar days (`YYYY-MM-DD`) given together, start on or before end; `--clear-period` removes it. `--outcome` (`unevaluated`, `achieved`, `missed`) is entered by a person and never inferred from story completion.
- Deleting a label also deletes its epic with the plan. `tm label deletion-impact` shows what would go.

### Labels on stories

Stories reference labels by ID. `--label`, `--add-label` and `--remove-label` take a label ID or, as a convenience, a label name that the CLI resolves to an ID through `tm label list` before calling the API.

```bash
tm story create --project <project-id> --title "..." --type feature --description "..." --label backend
tm story update --project <project-id> 12 --add-label backend --remove-label <label-id>
tm story update --project <project-id> 12 --label backend --label api   # replaces the whole set
tm story update --project <project-id> 12 --clear-labels
tm story list --project <project-id> --label backend --label api        # any of them
```

An unknown label is rejected with exit code 2 and nothing changes.

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
