import { and, asc, count, eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import type { ProjectLabel } from "../../../domain/entities/project-label";
import type {
  CreateProjectLabelInput,
  ProjectLabelRepository,
  ProjectLabelRepositoryError,
  UpdateProjectLabelInput,
} from "../../../domain/repositories/project-label-repository";
import {
  PROJECT_LABEL_DUPLICATE_NAME_ERROR,
  PROJECT_LABEL_REPOSITORY_ERROR,
} from "../../../domain/repositories/project-label-repository";
import { createDb, type DbClient } from "../client";
import { projectLabelsTable } from "../schema/project-labels";
import { storyLabelsTable } from "../schema/story-labels";

function toEntity(row: typeof projectLabelsTable.$inferSelect): ProjectLabel {
  return {
    __typename: "ProjectLabel",
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class D1ProjectLabelRepository implements ProjectLabelRepository {
  private db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(
    input: CreateProjectLabelInput,
  ): Promise<Result<ProjectLabel, ProjectLabelRepositoryError>> {
    // Check for duplicate name before insert
    const existing = await this.db
      .select({ id: projectLabelsTable.id })
      .from(projectLabelsTable)
      .where(
        and(
          eq(projectLabelsTable.projectId, input.projectId),
          eq(projectLabelsTable.name, input.name),
        ),
      )
      .get();

    if (existing) {
      return err(PROJECT_LABEL_DUPLICATE_NAME_ERROR);
    }

    const id = ulid();
    const now = new Date().toISOString();

    await this.db.insert(projectLabelsTable).values({
      id,
      projectId: input.projectId,
      name: input.name,
      color: input.color,
      createdAt: now,
      updatedAt: now,
    });

    const row = await this.db
      .select()
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.id, id))
      .get();

    if (!row) {
      return err(PROJECT_LABEL_REPOSITORY_ERROR);
    }

    return ok(toEntity(row));
  }

  async findById(
    projectId: string,
    id: string,
  ): Promise<Result<ProjectLabel | null, ProjectLabelRepositoryError>> {
    const row = await this.db
      .select()
      .from(projectLabelsTable)
      .where(
        and(
          eq(projectLabelsTable.id, id),
          eq(projectLabelsTable.projectId, projectId),
        ),
      )
      .get();

    return ok(row ? toEntity(row) : null);
  }

  async update(
    input: UpdateProjectLabelInput,
  ): Promise<Result<ProjectLabel | null, ProjectLabelRepositoryError>> {
    const existing = await this.db
      .select()
      .from(projectLabelsTable)
      .where(
        and(
          eq(projectLabelsTable.id, input.id),
          eq(projectLabelsTable.projectId, input.projectId),
        ),
      )
      .get();

    if (!existing) {
      return ok(null);
    }

    const updates: Partial<typeof projectLabelsTable.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.color !== undefined) {
      updates.color = input.color;
    }

    // Check for duplicate name if renaming
    if (input.name !== undefined && input.name !== existing.name) {
      const duplicate = await this.db
        .select({ id: projectLabelsTable.id })
        .from(projectLabelsTable)
        .where(
          and(
            eq(projectLabelsTable.projectId, input.projectId),
            eq(projectLabelsTable.name, input.name),
          ),
        )
        .get();

      if (duplicate) {
        return err(PROJECT_LABEL_DUPLICATE_NAME_ERROR);
      }
    }

    await this.db
      .update(projectLabelsTable)
      .set({
        name: input.name ?? existing.name,
        color: updates.color ?? existing.color,
        updatedAt: updates.updatedAt,
      })
      .where(
        and(
          eq(projectLabelsTable.id, input.id),
          eq(projectLabelsTable.projectId, input.projectId),
        ),
      );

    const row = await this.db
      .select()
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.id, input.id))
      .get();

    if (!row) {
      return err(PROJECT_LABEL_REPOSITORY_ERROR);
    }

    return ok(toEntity(row));
  }

  async delete(
    projectId: string,
    id: string,
  ): Promise<Result<boolean, ProjectLabelRepositoryError>> {
    const deleted = await this.db
      .delete(projectLabelsTable)
      .where(
        and(
          eq(projectLabelsTable.id, id),
          eq(projectLabelsTable.projectId, projectId),
        ),
      )
      .returning({ id: projectLabelsTable.id });

    return ok(deleted.length > 0);
  }

  async list(
    projectId: string,
  ): Promise<Result<ProjectLabel[], ProjectLabelRepositoryError>> {
    const rows = await this.db
      .select()
      .from(projectLabelsTable)
      .where(eq(projectLabelsTable.projectId, projectId))
      .orderBy(asc(projectLabelsTable.name))
      .all();

    return ok(rows.map(toEntity));
  }

  async countStories(
    projectId: string,
    id: string,
  ): Promise<Result<number, ProjectLabelRepositoryError>> {
    const row = await this.db
      .select({ value: count() })
      .from(storyLabelsTable)
      .where(
        and(
          eq(storyLabelsTable.projectId, projectId),
          eq(storyLabelsTable.labelId, id),
        ),
      )
      .get();

    return ok(row?.value ?? 0);
  }
}
