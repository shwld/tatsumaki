---
name: tatsumaki
description: Use when the user asks an agent to inspect, plan, or update tatsumaki stories, projects, work-items, project artifacts (built static sites published with tm artifact), or related tm CLI workflows. Prefer this skill for tatsumaki operations, story triage, work-item status checks, and safe agent use of tm.
---

# tatsumaki

Use this skill to operate tatsumaki as a product workflow, not as a generic shell-command cookbook. The official v1 operation surface is the `tm` CLI.

## Operating Context

- Treat tatsumaki work as story, project, and work-item management.
- Use `tm` for tatsumaki state. Do not use provider CLIs such as `gh issue view` as the source of truth for tatsumaki work-items.
- Prefer machine-readable output. Use `--json` for reads whenever the command supports it.
- Ask for explicit user confirmation before write operations, including creating, updating, moving, closing, or deleting stories and work-items.

## Preflight

1. Confirm the CLI is installed:

```bash
tm --version
```

2. Confirm the target service configuration:

```bash
tm config show
```

3. Confirm authentication:

```bash
tm --json whoami
```

If `tm` is missing, tell the user that tatsumaki's release installer is the supported install path and ask before running it:

```bash
curl -fsSL https://github.com/shwld/tatsumaki/releases/latest/download/install-tm.sh | bash
```

## Authentication

- `tm` authentication precedence is `TATSUMAKI_TOKEN` first, then the local credential store such as macOS Keychain.
- Do not ask the user to pass a token on every command.
- In sandboxed agents, Keychain access may require additional user approval even when the same `tm` command works in a normal terminal.
- If `tm --json whoami` fails in an agent sandbox, explain that the agent may not have credential-store access and ask the user whether to approve the command, run `tm login`, or provide a scoped `TATSUMAKI_TOKEN` for that session.

## Read Workflow

1. Identify the project or story scope from the user request.
2. Read tatsumaki state with `tm` and `--json` when available.
3. Summarize the relevant story, project, or work-item state without exposing tokens or credential details.
4. If the user asks for GitHub provider details, make clear whether that is supporting context or tatsumaki source-of-truth data.

## Write Workflow

1. Show the intended tatsumaki target and mutation in plain language.
2. Ask for confirmation before running the write command.
3. Run the smallest `tm` command that performs the requested change.
4. Re-read with `tm --json` where possible and report the resulting state.

## Artifacts

An artifact is a project-scoped snapshot of a built static site that members view in tatsumaki. Only the CLI creates or changes one; the Web is read-only. Publishing is a write operation: confirm with the user first (see Write Workflow).

Build the site first; `tm` never builds or installs anything. The directory must contain `tatsumaki-artifact.json`:

```json
{ "schemaVersion": 1, "entrypoint": "index.html", "exclude": ["**/*.map"] }
```

- `entrypoint` is a `.html` file inside the directory and must not be excluded. `exclude` is optional globs.
- The CLI refuses the whole upload (it never skips silently) for `.git`, `.env*`, keys, certificates, credential-like files, symlinks, absolute or parent paths. Limits: 50 MiB in total, 25 MiB per file, 1,000 files.
- The page runs in an isolated sandbox: no network (`connect-src none`), cookies, storage, popups, downloads or clipboard. Use relative asset paths and hash routing (`#/route`) because each version is served under a token path; use no CDN, remote image or web font.

Commands (add `--json` for machine-readable output):

```bash
tm --json artifact create --project <project> --title "Release report" --path ./dist
tm --json artifact update <artifact-id> --project <project> --path ./dist --base-version <n>
tm --json artifact update <artifact-id> --project <project> --title "New title"
tm --json artifact get <artifact-id> --project <project> [--files]
tm --json artifact list --project <project> [--archived]
tm --json artifact versions <artifact-id> --project <project>
tm --json artifact download <artifact-id> --project <project> [--version <n>] --out ./empty-dir
tm --json artifact archive <artifact-id> --project <project>
tm --json artifact unarchive <artifact-id> --project <project>
```

- `create` returns the artifact ID, version and URLs. Share the fixed URL (it always shows the same content) or the latest URL.
- Re-sending an identical tree is a successful no-op that returns the existing latest version. Changing the title or archiving never creates a version.
- Updating a directory needs `--base-version`. If someone published first the command fails with a conflict; do not retry blindly. Download the latest, merge the change, and update again with the new base version. There is no force option and no rollback command: download the old version and update from it.
- `download` writes only into a directory that does not exist or is empty, and never overwrites files.
- API keys use the `artifact:read` and `artifact:write` scopes; a project member who is a viewer can read and download but not change.

## Boundary

Never work around a failed tatsumaki write by directly mutating provider state unless the user explicitly changes the task from tatsumaki work-item operation to provider maintenance.
