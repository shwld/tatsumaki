import { Hono } from "hono";
import {
  createSavedFilter,
  INVALID_SAVED_FILTER_NAME_ERROR,
  INVALID_SAVED_FILTER_CONDITIONS_ERROR,
} from "../../application/usecases/create-saved-filter";
import { deleteSavedFilter } from "../../application/usecases/delete-saved-filter";
import { listSavedFilters } from "../../application/usecases/list-saved-filters";
import { D1SavedFilterRepository } from "../../infrastructure/db/repositories/d1-saved-filter-repository";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";
import type { SavedFilterConditions } from "../../domain/entities/saved-filter";
import {
  SAVED_FILTER_NOT_FOUND_ERROR,
  SAVED_FILTER_FORBIDDEN_ERROR,
} from "../../domain/repositories/saved-filter-repository";

export const savedFiltersRoute = new Hono<Env>();

savedFiltersRoute.get("/projects/:projectId/saved-filters", async (c) => {
  const projectId = c.req.param("projectId");
  const currentUser = c.get("currentUser");

  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) return membership.response;

  const repository = new D1SavedFilterRepository(c.env.DB);
  const result = await listSavedFilters(repository, {
    projectId,
    userId: currentUser.id,
  });

  if (result.isErr()) {
    return c.json({ error: "Failed to load saved filters" }, 500);
  }

  return c.json({ savedFilters: result.value });
});

savedFiltersRoute.post("/projects/:projectId/saved-filters", async (c) => {
  const projectId = c.req.param("projectId");
  const currentUser = c.get("currentUser");

  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) return membership.response;

  let body: {
    name?: string;
    filters?: SavedFilterConditions;
    visibility?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { name, filters, visibility } = body;

  if (typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.trim().length > 100) {
    return c.json({ error: "name must be 100 characters or fewer" }, 400);
  }
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return c.json({ error: "filters is required" }, 400);
  }

  const MAX_ARRAY_ITEMS = 50;
  const MAX_QUERY_LENGTH = 200;
  const f = filters as Record<string, unknown>;
  if (
    (f.query !== undefined &&
      (typeof f.query !== "string" || f.query.length > MAX_QUERY_LENGTH)) ||
    (f.types !== undefined &&
      (!Array.isArray(f.types) || f.types.length > MAX_ARRAY_ITEMS)) ||
    (f.unestimatedOnly !== undefined &&
      typeof f.unestimatedOnly !== "boolean") ||
    (f.statuses !== undefined &&
      (!Array.isArray(f.statuses) || f.statuses.length > MAX_ARRAY_ITEMS)) ||
    (f.ownerIds !== undefined &&
      (!Array.isArray(f.ownerIds) || f.ownerIds.length > MAX_ARRAY_ITEMS)) ||
    (f.labels !== undefined &&
      (!Array.isArray(f.labels) || f.labels.length > MAX_ARRAY_ITEMS)) ||
    (f.epicIds !== undefined &&
      (!Array.isArray(f.epicIds) || f.epicIds.length > MAX_ARRAY_ITEMS))
  ) {
    return c.json({ error: "Invalid filter conditions" }, 400);
  }

  const repository = new D1SavedFilterRepository(c.env.DB);
  const result = await createSavedFilter(repository, {
    projectId,
    ownerUserId: currentUser.id,
    name,
    filters,
    visibility: visibility === "project" ? "project" : "private",
  });

  if (result.isErr()) {
    if (result.error === INVALID_SAVED_FILTER_NAME_ERROR) {
      return c.json({ error: "Filter name must not be empty" }, 400);
    }
    if (result.error === INVALID_SAVED_FILTER_CONDITIONS_ERROR) {
      return c.json(
        { error: "At least one filter condition is required" },
        400,
      );
    }
    return c.json({ error: "Failed to create saved filter" }, 500);
  }

  return c.json({ savedFilter: result.value }, 201);
});

savedFiltersRoute.delete(
  "/projects/:projectId/saved-filters/:filterId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const filterId = c.req.param("filterId");
    const currentUser = c.get("currentUser");

    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const repository = new D1SavedFilterRepository(c.env.DB);
    const result = await deleteSavedFilter(repository, {
      id: filterId,
      projectId,
      userId: currentUser.id,
    });

    if (result.isErr()) {
      if (result.error === SAVED_FILTER_NOT_FOUND_ERROR) {
        return c.json({ error: "Saved filter not found" }, 404);
      }
      if (result.error === SAVED_FILTER_FORBIDDEN_ERROR) {
        return c.json({ error: "You cannot delete this saved filter" }, 403);
      }
      return c.json({ error: "Failed to delete saved filter" }, 500);
    }

    return c.json({ success: true });
  },
);
