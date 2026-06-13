import { Hono } from "hono";
import { listProjectHistory } from "../../application/usecases/list-project-history";
import { D1StoryActivityRepository } from "../../infrastructure/db/repositories/d1-story-activity-repository";
import type { Env } from "../../index";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
} from "../lib/timeline-cursor";
import { requireProjectMembership } from "./project-membership";

export const projectHistoryRoute = new Hono<Env>();

const DEFAULT_PROJECT_HISTORY_LIMIT = 30;
const MAX_PROJECT_HISTORY_LIMIT = 100;

function parseProjectHistoryLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") {
    return DEFAULT_PROJECT_HISTORY_LIMIT;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }
  return Math.min(value, MAX_PROJECT_HISTORY_LIMIT);
}

projectHistoryRoute.get("/projects/:projectId/history", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const limit = parseProjectHistoryLimit(c.req.query("limit"));
  if (limit === null) {
    return c.json({ error: "Invalid limit" }, 400);
  }

  const beforeRaw = c.req.query("before");
  let before: { createdAt: string; id: string } | undefined;
  if (beforeRaw !== undefined && beforeRaw !== "") {
    const decoded = decodeTimelineCursor(beforeRaw);
    if (!decoded.ok) {
      return c.json({ error: "Invalid cursor" }, 400);
    }
    before = { createdAt: decoded.createdAt, id: decoded.id };
  }

  const activityRepository = new D1StoryActivityRepository(c.env.DB);
  const result = await listProjectHistory(activityRepository, projectId, {
    limit,
    before,
  });

  if (result.isErr()) {
    return c.json({ error: "Failed to load project history" }, 500);
  }

  const page = result.value;
  const nextCursor =
    page.hasMore && page.nextBefore
      ? encodeTimelineCursor(page.nextBefore.createdAt, page.nextBefore.id)
      : null;

  return c.json({
    history: page.entries,
    hasMore: page.hasMore,
    nextCursor,
  });
});
