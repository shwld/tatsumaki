# ADR-0007: Adopt React Query for Story Multi-Panel State

## Metadata

- **status**: accepted
- **deciders**: tatsumaki maintainers
- **date**: 2026-04-10
- **enforcement**: manual

## Context

`StoryMultiPanelScreen` had grown into a large client-state container with per-panel loading/error/pagination state, bootstrap fetches, and mutation side effects in a single component. This made partial refactors risky and increased re-render pressure because panel fetch state and story lists were managed together by local `useState`.

The story list UX requirement is to update only affected panels during operations such as "Load more", filter changes, and mutations, while keeping behavior consistent across Done/Current/Backlog/Icebox panels.

## Decision

Move story list fetching and bootstrap data fetching to React Query based hooks:

- `useProjectBootstrap` for project/iteration/member/label bootstrap data
- `usePanelStoriesQuery` for panel-scoped `useInfiniteQuery`
- `storyQueryKeys` as the canonical query key factory for panel filters and comments
- `useStoryComments` switched from local state/effect to `useQuery` cache

Keep the screen responsible for interaction orchestration (DnD, optimistic panel updates, bulk actions, status changes), and invalidate panel queries after write operations to re-sync server truth.

## Consequences

- Easier:
  - Panel-level pagination and refetch behavior are isolated and reusable.
  - Filter changes naturally reset pagination via query key changes.
  - Comments and bootstrap data can be reused from cache across toggles/navigation.
- Harder:
  - Query invalidation discipline becomes mandatory after mutations.
  - Mixed optimistic local updates and query cache invalidation can diverge if not consistently applied.
  - Team now has two state sources to reason about in this screen (local optimistic panel state + React Query cache).
