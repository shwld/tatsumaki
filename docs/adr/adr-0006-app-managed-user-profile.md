# ADR-0006: App-managed user profile

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-04-06
- **supersedes**:
- **superseded_by**:
- **enforcement**: manual

## Context

Cloudflare Access authenticates users and provides identity claims such as `sub` and `email`, but those claims are not sufficient for tatsumaki's product needs.

This story introduces editable account information:

- users must be able to update a display name
- users must be able to update an app-specific contact email
- updated values must persist after reload

If `/api/auth/me` keeps returning only the current Access JWT claims, any user-edited profile would be overwritten or lost. We need a durable application-level profile that is keyed by the authenticated user ID but managed by tatsumaki.

## Decision

- Add a `users` table as the persistent source of truth for application-managed profile data
- Use the authenticated Access `sub` as the stable primary key for `users.id`
- Bootstrap a `users` row on first authenticated `/api/auth/me` access using Access claims as initial seed data only
- Treat the stored `users.email` as the app-managed contact address after creation; later Access email changes do not overwrite it automatically
- Expose `/api/auth/me` as the profile read/update API for the signed-in user

## Consequences

- Account settings can evolve independently from Cloudflare Access claim structure
- Future user-facing profile fields can be added without coupling them to auth middleware
- The first-login bootstrap path must remain safe and idempotent
- Product and review discussions must distinguish between authentication identity data and app-managed profile data
