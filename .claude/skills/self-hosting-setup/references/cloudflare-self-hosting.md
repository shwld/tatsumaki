# Cloudflare Self-Hosting

Use this reference only when the user wants Cloudflare self-hosting, deploy readiness checks, or setup troubleshooting.

## User-Owned Resources

Ask the user to create or confirm these Cloudflare resources. Do not create them automatically unless the user explicitly asks.

| Resource | Expected value |
| --- | --- |
| Worker | `tatsumaki` |
| D1 database | `tatsumaki-db` |
| KV namespace | Bound as `OAUTH_KV` |
| R2 bucket | `tatsumaki-story-attachments` |
| R2 bucket | `tatsumaki-user-avatars` |
| Durable Object | `PLANNING_POKER_DO` from `apps/web/wrangler.toml` |
| Access Application | Protects the production custom domain or route |
| Domain / Route | Production custom domain or route |

## Required Values

Set environment-specific values outside git.

| Value | Source | Where to set |
| --- | --- | --- |
| `ACCESS_AUD` | Cloudflare Access Application Audience tag | Worker runtime variable/secret |
| `ACCESS_TEAM_DOMAIN` | Zero Trust team domain, for example `<team>.cloudflareaccess.com` | Worker runtime variable/secret |
| `TATSUMAKI_D1_DATABASE_ID` | UUID for remote D1 database `tatsumaki-db` | Workers Builds variable |
| `TATSUMAKI_OAUTH_KV_NAMESPACE_ID` | Existing OAuth KV namespace ID, optional | Workers Builds variable |

Do not commit `.dev.vars`, `.env`, account IDs, resource IDs, API tokens, or secrets.

## Workers Builds Settings

Use these settings when configuring Cloudflare Workers Builds for this repository.

| Field | Value |
| --- | --- |
| Path / Root directory | `apps/web` |
| Build command | `bun run build:client` |
| Deploy command | `bun run db:migrate && bun run deploy:worker` |
| Non-production branch deploy command | `bun run deploy:upload` |

The deploy command applies remote D1 migrations before publishing the Worker. Non-production branch deploys upload a Worker version without running production database migrations.

## Local Access Verification

Normal local development uses `apps/web/wrangler.dev.toml`, including `DEV_AUTH_EMAIL = "dev@localhost"`.

Use `docs/local-cloudflare-access-setup.md` only when the user wants to verify the real Cloudflare Access login flow against a local `wrangler dev` server through Cloudflare Tunnel.

## Deploy Readiness Checklist

Before presenting a deploy command, confirm:

- The production domain or route is configured.
- The Access Application protects that domain or route.
- `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` are configured as runtime values.
- `TATSUMAKI_D1_DATABASE_ID` is configured as a build value.
- R2 buckets and KV namespace match `apps/web/wrangler.toml` bindings.
- The user understands `bun run deploy:web` runs remote D1 migrations and deploys the Worker.

## References

- Cloudflare D1 Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- Cloudflare Workers Builds configuration: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Cloudflare environment variables and secrets: https://developers.cloudflare.com/workers/configuration/environment-variables/

