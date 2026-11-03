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

## Amendment: compact application header (story #307, 2026-09-13)

At the user's explicit request, combine the application controls and story toolbar into one header: icon-only home link on the left, notification and account controls on the right. Hide the header while scrolling down and reveal it while scrolling up or returning to the top. Preserve keyboard access and keep it visible while its controls are in use. This exception changes header chrome only; panel structure and story workflows continue to follow the existing decision.

## Amendment: story archives (story #330, 2026-11-03)

Allow stories to be archived independently of their workflow status. PivotalTracker has no equivalent cancellation state, and deletion loses history while keeping obsolete stories in Icebox adds noise. Archived stories are excluded from normal panels and calculations, discoverable through search, and can be restored. Their details remain read-only while archived.

Keep owner and blocker relationships when archiving. Archived stories do not appear as blockers in active story lists. When restoring a story whose iteration has ended, clear the iteration assignment so it returns to Backlog; retain current or future assignments.
