# ADR-0002: PivotalTracker-based UI design

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-04-02
- **enforcement**: manual

## Context

tatsumaki is a project management tool modeled after PivotalTracker. Early development produced multiple screen layouts (list view, board view, dedicated My Work page) and custom UI patterns that diverged from PivotalTracker's design. This led to inconsistent user experience and unnecessary implementation surface area. We needed a single, authoritative reference for UI/UX decisions to prevent ad-hoc divergence.

## Decision

Adopt PivotalTracker as the sole reference for all UI/UX design decisions:

- **UI fidelity**: Screen layout, panel structure, story card information display, state transition buttons, and sidebar composition follow PivotalTracker's existing behavior and appearance. No custom interpretations or embellishments.
- **Single panel view**: Story display uses only PivotalTracker's panel view (Current / Backlog / Icebox columns side-by-side). No list view, board view, or other display variants.
- **Filter over new screens**: Screens that differ only by filter criteria (e.g., "My Work" = stories assigned to current user) are implemented as filter/panel toggles within the existing view, not as separate pages.
- **Screen creation gate**: Before adding a new screen, verify that PivotalTracker has a corresponding screen. If it does not, do not create one.

## Consequences

- Reduced decision overhead: UI disagreements resolve by checking PivotalTracker
- Smaller codebase: eliminated redundant view variants and dedicated filter pages
- Constraint: features with no PivotalTracker equivalent require an explicit decision (new ADR or amendment) before implementation
- Onboarding benefit: contributors familiar with PivotalTracker can navigate the codebase intuitively
