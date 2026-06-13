# ADR-0003: Correctness over compatibility in domain design

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-04-02
- **enforcement**: manual

## Context

During development, domain models were sometimes split, wrapped, or adapted to maintain backward compatibility with existing code or to accommodate UI/API layer conveniences. This produced duplicate types, adapter layers, and domain logic scattered across presentation and infrastructure layers. Since tatsumaki is pre-production with no external consumers, backward compatibility carries no value and actively harms code health.

## Decision

Prioritize correct domain design over backward compatibility in all implementations:

- **No compatibility shims**: Do not create wrappers, adapters, or re-exports to preserve backward compatibility. Rewrite to the correct design directly.
- **Single domain model**: When the same concept is represented by multiple types, functions, or modules, consolidate into a single domain model.
- **Domain integrity**: Do not split domain models or domain logic to accommodate UI or API layer needs. Presentation differences are absorbed in the presentation layer.
- **Business-unit cohesion**: Domain model design aligns with the user story map's business classifications (Story Kind), not with screen or API boundaries.
- **Proactive cleanup**: When encountering an unnatural split or duplication, refactor it to the correct form without preserving the old structure.

## Consequences

- Simpler codebase: no compatibility layers, no duplicate representations
- Faster refactoring: changes can be made directly without migration paths
- Risk: once tatsumaki reaches production, this policy must be revisited (a new ADR should supersede this one)
- Review overhead: reviewers must verify that domain models reflect business concepts, not technical convenience
