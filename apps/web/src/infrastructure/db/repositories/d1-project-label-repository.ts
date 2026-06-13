import { and, asc, eq } from "drizzle-orm";
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

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
};

type D1BatchClientLike = {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
};

export class D1ProjectLabelRepository implements ProjectLabelRepository {
  private db: DbClient;
  private d1: D1BatchClientLike;

  constructor(d1: D1Database) {
    this.d1 = d1 as unknown as D1BatchClientLike;
    this.db = createDb(d1);
  }

  private buildRenameCascadeStatement(
    projectId: string,
    previousName: string,
    nextName: string,
  ) {
    return this.d1
      .prepare(
        `update stories
       set labels = (
         with mapped as (
           select
             cast(json_each.key as integer) as idx,
             case
               when cast(json_each.value as text) = ?2 then ?3
               else cast(json_each.value as text)
             end as value
           from json_each(stories.labels)
         ),
         deduped as (
           select
             idx,
             value,
             row_number() over (partition by value order by idx) as rn
           from mapped
         )
         select coalesce(json_group_array(value), json('[]'))
         from (
           select value
           from deduped
           where rn = 1
           order by idx
         )
       ),
       updated_at = current_timestamp
       where stories.project_id = ?1
         and exists (
           select 1
           from json_each(stories.labels)
           where cast(json_each.value as text) = ?2
         )`,
      )
      .bind(projectId, previousName, nextName);
  }

  private buildDeleteCascadeStatement(projectId: string, removedName: string) {
    return this.d1
      .prepare(
        `update stories
       set labels = (
         select coalesce(json_group_array(value), json('[]'))
         from (
           select cast(json_each.value as text) as value
           from json_each(stories.labels)
           where cast(json_each.value as text) <> ?2
           order by cast(json_each.key as integer)
         )
       ),
       updated_at = current_timestamp
       where stories.project_id = ?1
         and exists (
           select 1
           from json_each(stories.labels)
           where cast(json_each.value as text) = ?2
         )`,
      )
      .bind(projectId, removedName);
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

    const nextName = input.name ?? existing.name;
    const previousName = existing.name;
    const statements = [
      this.d1
        .prepare(
          `update project_labels
           set name = ?1, color = ?2, updated_at = ?3
           where id = ?4 and project_id = ?5`,
        )
        .bind(
          nextName,
          updates.color ?? existing.color,
          updates.updatedAt,
          input.id,
          input.projectId,
        ),
    ];
    if (nextName !== previousName) {
      statements.push(
        this.buildRenameCascadeStatement(
          input.projectId,
          previousName,
          nextName,
        ),
      );
    }

    await this.d1.batch(statements);

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
    const existing = await this.db
      .select({ name: projectLabelsTable.name })
      .from(projectLabelsTable)
      .where(
        and(
          eq(projectLabelsTable.id, id),
          eq(projectLabelsTable.projectId, projectId),
        ),
      )
      .get();

    if (!existing) {
      return ok(false);
    }

    await this.d1.batch([
      this.d1
        .prepare(`delete from project_labels where id = ?1 and project_id = ?2`)
        .bind(id, projectId),
      this.buildDeleteCascadeStatement(projectId, existing.name),
    ]);

    return ok(true);
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
}
