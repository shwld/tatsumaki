# ADR-0013: Label-bound epics and ID-based story labels

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-11-08
- **enforcement**: manual

## Context

Stories store labels as a JSON array of label names (`stories.labels`), while `project_labels` already has IDs. Epics are a separate entity with their own unique name, and a story belongs to at most one epic through `stories.epic_id` (migration 0014). Renaming a label silently detaches stories, a story cannot contribute to more than one epic, and an epic and a label with the same name are unrelated records.

We want to plan strategy with epics: a plan written as one rich-text description (purpose and success criteria), any number of owners and a planned period, with progress derived from the stories that contribute to it, including stories shared between epics.

PivotalTracker ties every epic to one label. A story belongs to an epic by carrying that label, removing the label removes it from the epic, and deleting an epic leaves its label as a normal label on the stories. An epic is done when all its stories, including those in the Icebox, are accepted.

- https://www.pivotaltracker.com/help/articles/tracking_big_features_themes_with_epics
- https://www.pivotaltracker.com/help/articles/organizing_with_epics

tatsumaki now runs as a hosted service with open registration ([ADR-0011](adr-0011-open-registration-free-plan.md)), so existing projects hold labels, epics and saved filters that must survive the change.

## Decision

### Model

- **Label is the source of name and color.** An epic is planning data attached to exactly one label (`labelId` UNIQUE; Label 1 : Epic 0..1). Epics have no name of their own and always display the label's current name, so renaming a label renames the epic.
- **Story labels are a many-to-many relation by ID.** `StoryLabel(projectId, storyId, labelId)` with primary key `(storyId, labelId)` is the only record of label membership. An epic's stories are derived through its label. There is no `StoryEpic` relation and no `stories.epic_id`.
- **Project consistency is enforced in the database.** Label, Epic and StoryLabel rows reference the same project through composite foreign keys or equivalent constraints, not only in application code.
- **Label names keep the current rule**: trimmed, non-empty, unique per project by exact match. Migration never merges names that differ after this rule.

### Strategy planning on and off

- The planning state lives in `Epic.enabled`; labels carry no duplicate flag. Turning planning on for a label the first time creates its epic. Turning it off sets `enabled = false` and keeps the description, owners and dates. Turning it on again restores the same epic and recalculates progress from the stories that carry the label at that moment.
- PivotalTracker discards an epic's description when the epic is deleted. We keep the plan instead because it is strategic information that outlives day-to-day label changes, and pausing a strategy should not lose it. Turning planning off corresponds to PivotalTracker's epic deletion: the label stays on its stories as a normal label.
- Deleting a label deletes its StoryLabel rows and its epic with the plan; stories are never deleted. The UI shows the affected counts and suggests turning planning off instead. Deleting only the plan is not part of turning planning off.

### Progress

- Progress is computed when read and never stored on the epic. Aggregation joins Epic → StoryLabel → Story in one query per request, not per epic.
- The standard measure is accepted stories divided by all stories carrying the label, including Icebox and every story type, as in PivotalTracker. Point-based progress is supplementary and limited to estimated features.
- A story shared by several epics counts fully in each epic. Totals across epics deduplicate by story ID.
- Whether an epic achieved its outcome is entered by a person (`outcomeStatus`) and is never inferred from story completion.

### Access and concurrency

- Project owners and members edit labels and epics; viewers read only. The server checks project membership and that referenced labels belong to the project.
- Turning planning on is an atomic upsert guarded by the `labelId` unique constraint. Epic edits and on/off changes carry a `revision` and reject stale writes.
- Story label edits are expressed as `addLabelIds` / `removeLabelIds` and applied atomically, so concurrent edits do not remove each other's labels.

### Data migration

This change moves production data, which [ADR-0004](adr-0004-immutable-migration-files.md) did not anticipate (see its amendment). The migration follows expand, backfill and contract in separate migration files:

1. Produce a reconciliation report first: existing labels, label names in `stories.labels`, epics and `stories.epic_id`. Ambiguous names and same-named concepts are reported, not merged.
2. Expand and backfill: add StoryLabel and the epic planning columns, resolve each story's label names to label IDs in the same project, and create labels for names that have none.
3. Connect existing epics to the label with the same name only after previewing the stories each connection adds. A same-named label with a different meaning is renamed first. Stories in the old `epic_id` receive the epic's label. Connected epics start with planning on and keep their ID and description.
4. Saved filters are converted in the same release that drops the old fields: label names become label IDs, and epic IDs become the label IDs of their connected epics. Conditions that cannot be converted are removed and reported.
5. Project History entries already recorded keep the label names they show; they describe what happened at that time. New entries record label IDs and display the current names.
6. Contract only after every client reads and writes label IDs: drop `stories.labels`, `stories.epic_id` and `epics.name`. Until then the old columns remain the rollback path.

### API compatibility

[ADR-0003](adr-0003-correctness-over-compatibility.md) still applies after open registration. Story APIs take label IDs only, and `epicId` is removed from Story responses. Responses may keep `labels` as the label names derived from StoryLabel, since that is presentation, not a second record.

- Affected consumers are API-key and MCP users of the programmatic API and the web client. `tm` does not write story labels or epic IDs, but its generated Story type lists `epicId` as a required nullable field. The release that removes `epicId` verifies that the released `tm` still parses Story responses; if it does not, the same release raises `minClientVersion` and ships a CLI built from the new contract.
- External users are still few, so we break the API in one release and announce it in the release notes instead of running a deprecation period.
- During the rollout, the server temporarily accepts label names at the API boundary from the release that switches storage to StoryLabel (story #378) until the release that switches every client to IDs (story #381), which removes it. The temporary path never writes the old column.
- Writes to `epicId` are rejected with an error that points to label membership.

### Scope

- An epic is the strategy axis; a user story map is the experience axis. Map activities, tasks or slices are not treated as epics automatically.
- The planned-period timeline has no PivotalTracker counterpart. Per the scope amendment of [ADR-0002](adr-0002-pivotaltracker-ui-design.md), it needs no exception ADR; its story records why it is needed. Epic management that PivotalTracker has follows PivotalTracker.

### Rejected alternatives

- **Keep `stories.labels` as names and link epics by label name**: renaming breaks membership and the two records drift.
- **A separate StoryEpic relation**: stories would have two parallel ways to express the same membership, and removing a label would not remove the story from the epic.
- **Store progress on the epic**: every story change would have to update every related epic, and stale counts would be visible.

## Consequences

- One relation answers both "which labels does this story have" and "which stories belong to this epic", and renaming a label is safe.
- Stories can contribute to several epics without weighting; cross-epic totals must deduplicate by story ID.
- Deleting a label has a wider effect than before and needs a confirmation that shows it.
- API consumers that send label names or read `epicId` break once, announced in the release notes.
- The migration needs a reconciliation step and owner decisions for same-named labels and epics before it runs in production.

## Amendment: one description and multiple owners (story #402)

- An epic keeps one rich-text (Markdown) `description` that holds both purpose and success criteria; `success_criteria` is removed. The text limit rises to 10,000 characters.
- Owners move from `epics.owner_id` to the `epic_owners` join table (`epic_id`, `user_id`). A trigger rejects an owner who is not a member of the epic's project; the API replaces the whole set with `ownerIds` and ignores duplicates. An empty set means no owner.
- The previous success criteria and single owner values are not carried over (the existing description is kept as is), and the API change is not announced separately (decided in the story).
- Epic management UI follows [ADR-0002](adr-0002-pivotaltracker-ui-design.md). PivotalTracker has no separate success-criteria field for an epic, which supports the single description; multiple owners are a tatsumaki extension recorded by this story.
- Creating an epic only turns planning on for a label; the description and owners are edited afterwards in the label's plan form.
