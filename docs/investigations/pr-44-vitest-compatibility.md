# PR #44 Vitest compatibility

## Plan / DoD / verify

Dependabot PR #44 has no linked tatsumaki story. Scope: restore the supported test dependency combination and verify the CI test commands.

## Investigation (2026-09-13)

- Unsupported Vitest major: high confidence. CI uses Vitest 5.0.0 with @cloudflare/vitest-pool-workers 0.22.0, which explicitly warns it supports only ^4.1.0. All 29 Workers test files fail before executing tests with `Unexpected identifier 'file'`.
- Application regression: low confidence. No test assertions execute; lint, typecheck and screenshot CI pass.
- Transient CI failure: low confidence. Every Workers test fails at the same startup boundary.

The npm registry confirms the latest pool release is 0.22.0 and its Vitest, runner and snapshot peer dependencies are ^4.1.0. Restore Vitest ^4.1.11 and regenerate the stale Bun lockfile from the repository root. Retain the other dependency updates.

Dependabot ignores Vitest >=5 until the Cloudflare pool supports that major. Remove this constraint when upgrading to a pool release whose peer dependencies support Vitest 5.

Local verification must use Node 24 from .mise.toml. Without a working Node executable, Bun executes Vitest and fails with a duplicate WebSocket Upgrade header; this is a separate local runtime issue and does not require application changes.

## Sources

- [Failed CI run](https://github.com/shwld/tatsumaki/actions/runs/34072494000/job/101592285232)
- [Published pool metadata](https://registry.npmjs.org/@cloudflare%2fvitest-pool-workers/0.22.0)
- [Dependency update PR](https://github.com/shwld/tatsumaki/pull/44)

## Verification

Node 24: Workers tests 325/325, setup/deploy tests 24/24, component tests 375/375 passed. Lint (existing warnings only), typecheck, OpenAPI check, package formatting and documentation links passed. Restoring supported Vitest resolves the CI startup failure locally, confirming the primary hypothesis. Remote CI remains pending until this patch is pushed.
