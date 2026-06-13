# ADR-0004: Immutable migration files

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-04-02
- **enforcement**: manual

## Context

Editing existing migration files after they have been applied (even in development) leads to schema drift between environments. Developers who have already run a migration locally will not re-run an edited version, causing silent inconsistencies. Since tatsumaki is pre-production and has no existing user data, data migration logic is unnecessary overhead.

## Decision

- Existing migration files (`apps/web/migrations/*.sql`) must never be modified after they are committed.
- All DB schema changes are made by creating a new migration file via the CLI.
- Data migration is not required (no production data exists).

## Consequences

- Migration history is append-only and auditable
- No risk of schema drift between developer environments
- Slightly more migration files over time, but each is small and self-contained
- When tatsumaki reaches production, data migration will become necessary and this policy should be amended
