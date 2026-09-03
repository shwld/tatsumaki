# Cloudflare Self-Hosting

Use this reference only when the user wants Cloudflare self-hosting, deploy readiness checks, or setup troubleshooting.

## Automated Resources

When the user explicitly requests remote setup, `bun apps/web/scripts/setup-cloudflare.ts` creates or reuses these resources.

| Resource | Expected value |
| --- | --- |
| Worker | `tatsumaki` |
| D1 database | `tatsumaki-db` |
| KV namespace | Bound as `OAUTH_KV` |
| R2 bucket | `tatsumaki-story-attachments` |
| R2 bucket | `tatsumaki-user-avatars` |
| Durable Object | `PLANNING_POKER_DO` from `apps/web/wrangler.toml` |
| Access Application | Protects the Worker destination |
| Access Policy | Explicitly allowed email addresses or email domains |

With `--with-staging`, every row receives an isolated `tatsumaki-staging` equivalent. No D1, KV, R2, Durable Object, or Access resource is shared with production.

## User-Owned Inputs

Create or obtain these outside git before the command is run.

| Value | Source | Where to set |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Scoped API token | Process environment only |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard | Process environment only |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Zero Trust team domain, for example `<team>.cloudflareaccess.com` | Process environment only |
| allowed identity | User-owned email or email domain | `--allow-email` / `--allow-domain` |

Do not commit `.dev.vars`, `.env`, account IDs, resource IDs, API tokens, or secrets.

The token needs D1 Write, Workers KV Storage Write, Workers R2 Storage Write, Workers Scripts Write, and Access: Apps and Policies Write account permissions.

## Bootstrap Command

Inspect the plan without network access or mutation first:

```bash
bun apps/web/scripts/setup-cloudflare.ts --allow-email you@example.com --with-staging --dry-run
```

Create production:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com bun apps/web/scripts/setup-cloudflare.ts --allow-email you@example.com
```

Append `--with-staging` to create production and staging together. For an existing installation, process only staging without reading or changing production resources:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com bun apps/web/scripts/setup-cloudflare.ts --allow-email you@example.com --staging-only
```

`--with-staging` and `--staging-only` are mutually exclusive. Add `--dry-run` first and confirm that staging-only output contains `[staging]` but not `[production]`. The command is restartable: exact-name resources are reused and missing resources are created. After a transient failure or permission correction, rerun the same command.

For a hosted staging environment with a private WorkerEntrypoint RPC backend, add `--staging-control-plane-service <worker-name>`. The generated staging configuration owns a `CONTROL_PLANE` Service Binding so later bootstrap deploys preserve it. This option requires `--with-staging` or `--staging-only`; production-only setup rejects it. Omitting the option keeps the self-hosted unlimited entitlement provider and does not require a private backend.

For hosted continuous deployment, use the separate procedure below; do not rerun bootstrap solely to change a Service Binding on an existing installation.

## Hosted Continuous Deployment

The optional non-secret **build/process** variable `CONTROL_PLANE_SERVICE` selects the backend Worker for normal `deploy:worker` and `deploy:upload` commands. It is not a runtime secret, and no Stripe credentials belong in the app's build environment. The deploy wrapper copies the selected base config, preserves resource bindings and paths, adds `CONTROL_PLANE` plus `ENTITLEMENT_MODE=control-plane`, and removes its temporary config on completion or failure. Existing self-hosted config remains unchanged when the variable is omitted.

For official production, select `tatsumaki-control-plane-production`; never select the staging backend. In Cloudflare Workers Builds for the production app, add `CONTROL_PLANE_SERVICE` under **Build variables and secrets**, and keep using the package deploy commands. A direct `wrangler deploy` bypasses this selection. Runtime dashboard Variables alone do not configure the build. Do not enable production build variables for unrelated preview branches.

From the repository root, build and inspect without remote migration or deployment:

```bash
bun run build:web
CONTROL_PLANE_SERVICE=tatsumaki-control-plane-production bun apps/web/scripts/deploy-cloudflare.ts deploy --dry-run
```

After checking the Worker name and every resource binding, run the same command without `--dry-run`. For an existing installation with locally maintained resource IDs, add `--config /absolute/path/to/wrangler.toml` (or a `.json` config). Relative paths in that config are preserved. Do not commit account-specific IDs. Named-environment flags are intentionally not forwarded: supply a base config for the exact deployment target.

Actual deploy applies D1 migrations before publishing; upload only creates a Worker version. Dry-run uses Wrangler's bundle validation for both modes and never migrates or uploads. A failed migration prevents deployment. Preserve the active Worker Version as a rollback reference before production changes, and verify the deployed Service Binding followed by the Access-authenticated `/api/billing/entitlement` response. This integration does not enable Checkout or enforce project quotas.

## Local Access Verification

Normal local development uses `apps/web/wrangler.dev.toml`, including `DEV_AUTH_EMAIL = "dev@localhost"`.

Use `docs/local-cloudflare-access-setup.md` only when the user wants to verify the real Cloudflare Access login flow against a local `wrangler dev` server through Cloudflare Tunnel.

## Deploy Readiness Checklist

Before presenting a deploy command, confirm:

- The API token has only the required account permissions.
- Account ID and Access team domain belong to the intended account.
- At least one Access email or email domain is explicitly allowed.
- `--dry-run` shows exactly the intended production and/or staging names.
- A staging Control Plane target, when provided, is the exact intended staging Worker and not a production service.
- The user understands the bootstrap applies remote D1 migrations and deploys the Worker.

## References

- Cloudflare Access applications API: https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/
- Cloudflare D1 database API: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/
- Cloudflare KV namespaces API: https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/create/
- Cloudflare R2 buckets API: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/create/
