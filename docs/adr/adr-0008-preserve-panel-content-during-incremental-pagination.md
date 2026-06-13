# ADR-0008: Preserve Panel Content During Incremental Pagination

## Metadata

- **status**: accepted
- **deciders**: tatsumaki maintainers
- **date**: 2026-04-13
- **enforcement**: manual

## Context

`StoryMultiPanelScreen` uses React Query infinite queries per panel and supports incremental pagination with the `もっと読み込む` action.

A regression caused the panel body to switch to a full "読み込み中..." placeholder when loading the next page. Existing stories temporarily disappeared even though data was already available. This violated the intended behavior from ADR-0007, which requires panel updates to be additive and panel-local during load-more operations.

## Decision

Distinguish initial loading from incremental pagination in panel rendering:

- Show full-panel loading placeholder only when there is no story data yet.
- During `fetchNextPage`/incremental fetch, keep already rendered stories visible.
- Restrict loading feedback to the load-more control state instead of replacing panel content.

This rule is implemented in `StoryPanel` via `showInitialLoading = isLoading && stories.length === 0`.

## Consequences

- Easier:
  - Load-more UX remains stable and additive.
  - Users keep context while additional rows are fetched.
  - Prevents panel flicker and perceived reloads during pagination.
- Harder:
  - Component loading-state semantics must be explicit (`initial` vs `incremental`) and verified with regression tests.
