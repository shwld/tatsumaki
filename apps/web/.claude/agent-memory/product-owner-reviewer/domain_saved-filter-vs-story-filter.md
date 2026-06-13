---
name: Saved filter vs story list filter terminology
description: SavedFilterConditions and ListStoriesInput drifting; ubiquitous language needs consolidation
type: project
---

SavedFilterConditions (`src/domain/entities/saved-filter.ts`) defines a subset of story search conditions
(query/types/statuses/ownerIds/labels/epicIds). The list-stories repository/use-case already supports
these plus more (iteration, isIcebox, requesterId, excludeIterationId, iterationDateScope). There is no
shared `StorySearchCriteria` value object.

Why: Feature "ストーリーを高度な条件で検索する" introduced SavedFilter but did not extract a common
"StorySearchCriteria" concept. Two parallel filter shapes risk drift (e.g., statuses exists in the
type but no UI/URL mapping; iteration absent from SavedFilter).

How to apply: When reviewing search/filter changes, propose consolidating into a single domain concept
(e.g., `StorySearchCriteria`) that both SavedFilter and listStories consume. Flag additions that widen
the gap.
