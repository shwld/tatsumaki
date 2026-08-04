# Contributing

Thanks for your interest in contributing to tatsumaki.

tatsumaki is currently pre-1.0. The project welcomes focused bug fixes, documentation improvements, and small usability improvements. Larger feature work should start with a GitHub issue or discussion before implementation.

## Before You Start

- Check existing issues and pull requests to avoid duplicate work.
- For security vulnerabilities, do not open a public issue. Follow the process in [SECURITY.md](SECURITY.md).
- For larger changes, describe the problem, proposed approach, and expected user impact before writing code.

## Development Setup

Install dependencies from the repository root:

```bash
bun install
```

Common checks:

```bash
bun run lint
bun run test
bun run typecheck
bun run docs:lint
```

Cloudflare deployment configuration lives in `apps/web/wrangler.toml` with only public self-hosting defaults and binding names. The self-hosting bootstrap writes resolved IDs and Access values only to temporary files and Cloudflare Worker secrets. Keep API tokens, account IDs, Access values, custom domains/routes, and all other account-specific values out of git.

## Pull Requests

Keep pull requests focused. A good pull request should:

- Explain what changed and why.
- Include tests or a clear reason why tests are not applicable.
- Update documentation when behavior or setup changes.
- Avoid unrelated refactoring.
- Keep generated or local-only files out of the diff.

Do not use `--no-verify` when committing or pushing. The repository hooks are part of the quality gate.

## Project Direction

tatsumaki is intended to remain self-hostable open source software. Future hosted SaaS offerings may provide managed hosting and operational convenience, but the open source repository should stay useful on its own.
