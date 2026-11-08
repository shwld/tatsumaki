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

## Amendment: production data migration (story #377, 2026-11-08)

tatsumaki now holds production data. Schema changes that move or reshape existing data include the data migration. Split it into expand, backfill and contract migration files, report rows that cannot be converted instead of discarding or merging them silently, and keep the old columns until every client uses the new shape so they remain the rollback path. [ADR-0013](adr-0013-label-bound-epic-planning.md) applies this to story labels and epics. The rule that committed migration files are never edited is unchanged.
