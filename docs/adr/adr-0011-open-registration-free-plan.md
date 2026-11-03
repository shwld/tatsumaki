# ADR-0011: Open registration with a participate-only free plan

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-11-03
- **supersedes**:
- **superseded_by**:
- **enforcement**: manual

## Context

Today a user can use tatsumaki only after accepting an invitation:

- `users.access_status` defaults to `pending` and becomes `allowed` only through invitation acceptance (`requireAppEntitlement`, `isAppEntitled`). Everything else answers `403 INVITATION_REQUIRED`: protected API, programmatic API (MCP / CLI), MCP OAuth handler and `/oauth/authorize`.
- A `users` row is created only when an invitation is accepted. `/api/auth/me` and `/billing/entitlement` sit behind the same gate, so a `pending` user has no row and cannot reach any account or billing screen.
- The official hosted Cloudflare Access application is restricted to one GitHub account.

The goal is to open registration to anyone on the official hosted service, keep a free plan that can only join projects, and offer Pro (Stripe, owned by the private Control Plane) for creating projects. OSS self-hosters are not part of this: without `ENTITLEMENT_MODE` the app keeps using `UnlimitedEntitlementProvider` and imposes no limits.

## Decision

### Plans and limits

- The free plan is participate-only: the Control Plane sets `FREE_MAX_OWNED_PROJECTS=0`. Joining projects is unlimited. Creating a project requires Pro.
- `maxOwnedProjects` counts projects the user currently owns (`countOwnedProjects`), not projects ever created. Deleting a project or handing over ownership frees a slot. The limit is only checked when creating a project.
- `grace` and `restricted` never change roles. The user stays owner, and existing data stays readable and editable. Only creating projects is blocked, matching the Control Plane contract that restrictions stop usage growth without hiding or deleting data.
- Unset `ENTITLEMENT_MODE` stays unlimited and does not fail startup. Only the official hosted deployment sets `control-plane`.

### Registration

- Authentication is Cloudflare Access with email one-time PIN only. GitHub is not offered.
- Access is not the gate for who may use the app. It proves control of an email address. Because email OTP is cheap to automate, Cloudflare Turnstile is required before a user becomes `allowed`. The challenge fails closed on the official hosted deployment (`ENTITLEMENT_MODE=control-plane`): onboarding is refused unless the complete Turnstile configuration (site key and secret) is present, so a missing or misnamed setting never becomes unchallenged registration. Only self-hosted deployments, where `ENTITLEMENT_MODE` is unset, treat Turnstile as optional.
- A first sign-in lands on an onboarding screen. The user passes Turnstile and accepts the terms and privacy policy; the server then verifies Turnstile with Siteverify (single use, hostname and action checked) and creates the `users` row as `allowed`. No `users` row exists before that, so there are no leftover `pending` rows to clean up.
- Invitations only join a project. Accepting one no longer decides whether the user may use the app.
- The empty state for a free user with no projects explains that creating projects needs Pro and how to get invited to someone else's project.

### `access_status`

- Keep the column and redefine it as a kill switch: `allowed` (default after onboarding) or `blocked` (set by the operator for abuse). `blocked` is refused on every path that uses `requireAppEntitlement` / `isAppEntitled`, and on `/api-key`, which authenticates a project API key and sets its owner as `currentUser` without that check today: `requireApiKeyAuth` must reject keys whose owner is `blocked`. `pending` is removed.
- The error `INVITATION_REQUIRED` is replaced by separate codes for "onboarding not completed" and "account blocked". Every consumer of the old code and the "Invitation required" responses must be updated together: `app-entitlement.ts`, the two plain-text responses in `index.ts`, the web client's 403 handling, the CLI, and `docs/local-cloudflare-access-setup.md`.
- Existing users were all set to `allowed` by migration 0049 and are unaffected.

### Billing identity

- `billingAccountId` is `users.id`, as today. The Control Plane creates an account for an unknown ID on first lookup, so the app asks for an entitlement only for users that finished onboarding. Anonymous or `blocked` users never create Control Plane rows.
- Cloudflare documents the Access `sub` claim as unique to an email address within one Zero Trust account; it changes if the user is removed and re-added or signs in to another organization ([application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)). A changed `sub` would create a second user and a second billing account. Linking accounts across such a change is out of scope here and tracked as a risk; Cloudflare's behavior for one-time-PIN users specifically is not documented and must be checked in the staging Access application before #354 ships.

### Abuse surface

- Rate-limit registration and API key issuance.
- Opening Access also exposes the paths that bypass it (`/api-key`, programmatic API, `/artifact-content`, OAuth authorize). For each, the rollout story must confirm the authentication method, anonymous access, origin isolation, and upload size and count limits before the production Access policy is widened.

## Consequences

- A free user who is never invited can do nothing but read the onboarding and upgrade guidance. Free registration is therefore an entry point to Pro and to invitations, not a standalone product.
- Registration depends on Turnstile and on the Control Plane; both must be reachable. If the Control Plane is unavailable, project creation fails with `ENTITLEMENT_UNAVAILABLE_ERROR`, while joining and normal use continue.
- The error-code change breaks any client that matches `INVITATION_REQUIRED`; the replacement is a coordinated change.
- Rollout order matters: Control Plane free limit and entitlement mode first, then onboarding, then billing display and upgrade flows, and only last the production Access policy. Opening Access earlier would let free users in before the limit applies.
- The production Access policy must have a documented rollback to the single-account policy.
