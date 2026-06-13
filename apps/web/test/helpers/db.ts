import { createDb } from "../../src/infrastructure/db/client";
import { projectLabelsTable } from "../../src/infrastructure/db/schema/project-labels";
import {
  projectInvitationsTable,
  projectMembersTable,
} from "../../src/infrastructure/db/schema/project-members";
import { projectApiKeysTable } from "../../src/infrastructure/db/schema/project-api-keys";
import { projectsTable } from "../../src/infrastructure/db/schema/projects";
import {
  storyOwnersTable,
  storiesTable,
  storyPriorityHistoryTable,
} from "../../src/infrastructure/db/schema/stories";
import { storyBlockersTable } from "../../src/infrastructure/db/schema/story-blockers";
import { iterationDailySnapshotsTable } from "../../src/infrastructure/db/schema/iteration-daily-snapshots";
import { iterationsTable } from "../../src/infrastructure/db/schema/iterations";
import { storyTimelineEntriesTable } from "../../src/infrastructure/db/schema/story-timeline";
import { usersTable } from "../../src/infrastructure/db/schema/users";

/**
 * Reset database by deleting all data between tests.
 *
 * Tables are created by migrations applied in test/helpers/apply-migrations.ts
 * via @cloudflare/vitest-pool-workers (readD1Migrations + applyD1Migrations).
 *
 * Delete order respects foreign key constraints (children before parents).
 */
export async function resetDatabase(db: D1Database): Promise<void> {
  const client = createDb(db);
  await client.delete(projectInvitationsTable);
  await client.delete(projectMembersTable);
  await client.delete(projectApiKeysTable);
  await client.delete(projectLabelsTable);
  await client.delete(storyTimelineEntriesTable);
  await client.delete(storyBlockersTable);
  await client.delete(storyOwnersTable);
  await client.delete(storyPriorityHistoryTable);
  await client.delete(storiesTable);
  await client.delete(iterationDailySnapshotsTable);
  await client.delete(iterationsTable);
  await client.delete(projectsTable);
  await client.delete(usersTable);
}
