import { and, eq, isNull } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { ulid } from "ulid";
import {
  isValidApiKeyScope,
  type ProjectApiKey,
} from "../../../domain/entities/project-api-key";
import {
  PROJECT_API_KEY_REPOSITORY_ERROR,
  type CreateApiKeyInput,
  type ProjectApiKeyRepository,
  type ProjectApiKeyRepositoryError,
} from "../../../domain/repositories/project-api-key-repository";
import { createDb, type DbClient } from "../client";
import { projectApiKeysTable } from "../schema/project-api-keys";

type ApiKeyRow = typeof projectApiKeysTable.$inferSelect;

function toProjectApiKey(row: ApiKeyRow): ProjectApiKey {
  let scopes: ProjectApiKey["scopes"] = [];
  try {
    const parsed: unknown = JSON.parse(row.scopes);
    if (Array.isArray(parsed)) {
      scopes = parsed.filter(isValidApiKeyScope);
    }
  } catch {
    // fall back to empty scopes
  }

  return {
    __typename: "ProjectApiKey",
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes,
    ownerUserId: row.ownerUserId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

export class D1ProjectApiKeyRepository implements ProjectApiKeyRepository {
  private readonly db: DbClient;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  async create(
    input: CreateApiKeyInput,
  ): Promise<Result<ProjectApiKey, ProjectApiKeyRepositoryError>> {
    try {
      const id = ulid();
      const now = new Date().toISOString();
      const rows = await this.db
        .insert(projectApiKeysTable)
        .values({
          id,
          projectId: input.projectId,
          name: input.name,
          keyHash: input.keyHash,
          keyPrefix: input.keyPrefix,
          scopes: JSON.stringify(input.scopes),
          ownerUserId: input.ownerUserId,
          createdAt: now,
        })
        .returning();

      if (!rows[0]) {
        return err(PROJECT_API_KEY_REPOSITORY_ERROR);
      }

      return ok(toProjectApiKey(rows[0]));
    } catch {
      return err(PROJECT_API_KEY_REPOSITORY_ERROR);
    }
  }

  async listByProject(
    projectId: string,
  ): Promise<Result<ProjectApiKey[], ProjectApiKeyRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(projectApiKeysTable)
        .where(eq(projectApiKeysTable.projectId, projectId));

      return ok(rows.map(toProjectApiKey));
    } catch {
      return err(PROJECT_API_KEY_REPOSITORY_ERROR);
    }
  }

  async findByHash(
    keyHash: string,
  ): Promise<Result<ProjectApiKey | null, ProjectApiKeyRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(projectApiKeysTable)
        .where(
          and(
            eq(projectApiKeysTable.keyHash, keyHash),
            isNull(projectApiKeysTable.revokedAt),
          ),
        )
        .limit(1);

      return ok(rows[0] ? toProjectApiKey(rows[0]) : null);
    } catch {
      return err(PROJECT_API_KEY_REPOSITORY_ERROR);
    }
  }

  async findById(
    id: string,
  ): Promise<Result<ProjectApiKey | null, ProjectApiKeyRepositoryError>> {
    try {
      const rows = await this.db
        .select()
        .from(projectApiKeysTable)
        .where(eq(projectApiKeysTable.id, id))
        .limit(1);

      return ok(rows[0] ? toProjectApiKey(rows[0]) : null);
    } catch {
      return err(PROJECT_API_KEY_REPOSITORY_ERROR);
    }
  }

  async revoke(
    id: string,
    revokedAt: string,
  ): Promise<Result<ProjectApiKey | null, ProjectApiKeyRepositoryError>> {
    try {
      const rows = await this.db
        .update(projectApiKeysTable)
        .set({ revokedAt })
        .where(eq(projectApiKeysTable.id, id))
        .returning();

      return ok(rows[0] ? toProjectApiKey(rows[0]) : null);
    } catch {
      return err(PROJECT_API_KEY_REPOSITORY_ERROR);
    }
  }

  async touchLastUsed(
    id: string,
    lastUsedAt: string,
  ): Promise<Result<void, ProjectApiKeyRepositoryError>> {
    try {
      await this.db
        .update(projectApiKeysTable)
        .set({ lastUsedAt })
        .where(eq(projectApiKeysTable.id, id));

      return ok(undefined);
    } catch {
      return err(PROJECT_API_KEY_REPOSITORY_ERROR);
    }
  }
}
