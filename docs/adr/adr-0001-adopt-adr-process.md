# ADR-0001: Adopt ADR process for architectural decisions

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-03-10
- **enforcement**: manual

## Context

Design decisions are discussed in PRs and issues but not recorded in a durable, searchable format. Over time, context is lost and similar debates repeat. We need a lightweight mechanism to capture "why" behind key decisions.

## Decision

Adopt Architecture Decision Records (ADR) following the format defined in `docs/adr/template.md`. Each ADR lives as a Markdown file in `docs/adr/`.

Key conventions:
- File naming: `adr-NNNN-kebab-case-title.md`
- Required metadata fields: `status`, `deciders`, `date`, `enforcement`
- Supersession must be bidirectional (both `supersedes` and `superseded_by` fields must match)
- PRs that introduce or change ADRs should reference them in the PR description

## Consequences

- New overhead: contributors must write an ADR for significant decisions
- Benefit: decisions are searchable, reviewable, and linked to enforcement mechanisms
- Cost: ADR metadata consistency is reviewed manually
