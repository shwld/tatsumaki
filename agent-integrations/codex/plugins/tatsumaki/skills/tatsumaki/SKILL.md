---
name: tatsumaki
description: Use when the user asks an agent to inspect, plan, or update tatsumaki stories, projects, work-items, or related tm CLI workflows. Prefer this skill for tatsumaki operations, story triage, work-item status checks, and safe agent use of tm.
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

## Boundary

Never work around a failed tatsumaki write by directly mutating provider state unless the user explicitly changes the task from tatsumaki work-item operation to provider maintenance.
