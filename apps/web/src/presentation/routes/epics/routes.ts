import { Hono, type Context } from "hono";
import {
  disableEpicPlanning,
  type EpicDependencies,
  enableEpicPlanning,
  getEpic,
  getEpicProgress,
  getLabelDeletionImpact,
  listEpicProgress,
  listEpics,
  type ManageEpicError,
  updateEpicPlan,
} from "../../../application/usecases/manage-epics";
import { D1EpicRepository } from "../../../infrastructure/db/repositories/d1-epic-repository";
import { D1ProjectLabelRepository } from "../../../infrastructure/db/repositories/d1-project-label-repository";
import type { Env } from "../../../index";
import { requireProjectMembership } from "../project-membership";
import {
  parseDisableEpicBody,
  parseEnableEpicBody,
  parseEpicPlanBody,
} from "./request-parsers";
import {
  currentCalendarDateUtc,
  toEpicErrorResponse,
  toEpicProgressResponse,
  toEpicResponse,
} from "./responses";

function dependencies(
  c: Context<Env>,
  projectRepository: EpicDependencies["projectRepository"],
): EpicDependencies {
  return {
    epicRepository: new D1EpicRepository(c.env.DB),
    labelRepository: new D1ProjectLabelRepository(c.env.DB),
    projectRepository,
  };
}

function errorResponse(c: Context<Env>, error: ManageEpicError) {
  const { status, code, message } = toEpicErrorResponse(error);
  return c.json({ error: message, code }, status);
}

async function readJson(
  c: Context<Env>,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const text = await c.req.text();
  if (text.trim() === "") {
    return { ok: true, body: undefined };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Strategy planning of labels (ADR-0013), shared by the Web API and the
 * programmatic API. Mounted under ".../projects".
 */
export function createEpicRoutes() {
  const app = new Hono<Env>();

  app.get("/:projectId/epics", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const result = await listEpics(
      dependencies(c, membership.repository),
      projectId,
    );
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ epics: result.value.map(toEpicResponse) });
  });

  app.get("/:projectId/epics/progress", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const result = await listEpicProgress(
      dependencies(c, membership.repository),
      { projectId, today: currentCalendarDateUtc() },
    );
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({
      epics: result.value.epics.map(toEpicProgressResponse),
      total: result.value.total,
    });
  });

  app.get("/:projectId/labels/:labelId/epic/progress", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const result = await getEpicProgress(
      dependencies(c, membership.repository),
      {
        projectId,
        labelId: c.req.param("labelId"),
        today: currentCalendarDateUtc(),
      },
    );
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({
      ...toEpicProgressResponse(result.value),
      stories: result.value.stories,
    });
  });

  app.get("/:projectId/labels/:labelId/epic", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const result = await getEpic(dependencies(c, membership.repository), {
      projectId,
      labelId: c.req.param("labelId"),
    });
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ epic: toEpicResponse(result.value) });
  });

  app.post("/:projectId/labels/:labelId/epic/enable", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const body = await readJson(c);
    if (!body.ok) return c.json({ error: "Invalid JSON body" }, 400);
    const parsed = parseEnableEpicBody(body.body);
    if (!parsed.ok) return c.json({ error: parsed.message }, 400);

    const result = await enableEpicPlanning(
      dependencies(c, membership.repository),
      {
        projectId,
        labelId: c.req.param("labelId"),
        actorRole: membership.member.role,
        ...parsed.value,
      },
    );
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ epic: toEpicResponse(result.value) });
  });

  app.post("/:projectId/labels/:labelId/epic/disable", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const body = await readJson(c);
    if (!body.ok) return c.json({ error: "Invalid JSON body" }, 400);
    const parsed = parseDisableEpicBody(body.body);
    if (!parsed.ok) return c.json({ error: parsed.message }, 400);

    const result = await disableEpicPlanning(
      dependencies(c, membership.repository),
      {
        projectId,
        labelId: c.req.param("labelId"),
        actorRole: membership.member.role,
        revision: parsed.value.revision,
      },
    );
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ epic: toEpicResponse(result.value) });
  });

  app.patch("/:projectId/labels/:labelId/epic", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const body = await readJson(c);
    if (!body.ok) return c.json({ error: "Invalid JSON body" }, 400);
    const parsed = parseEpicPlanBody(body.body);
    if (!parsed.ok) return c.json({ error: parsed.message }, 400);

    const result = await updateEpicPlan(
      dependencies(c, membership.repository),
      {
        projectId,
        labelId: c.req.param("labelId"),
        actorRole: membership.member.role,
        ...parsed.value,
      },
    );
    if (result.isErr()) return errorResponse(c, result.error);
    return c.json({ epic: toEpicResponse(result.value) });
  });

  app.get("/:projectId/labels/:labelId/deletion-impact", async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;

    const result = await getLabelDeletionImpact(
      dependencies(c, membership.repository),
      { projectId, labelId: c.req.param("labelId") },
    );
    if (result.isErr()) return errorResponse(c, result.error);
    const { label, storyCount, epic } = result.value;
    return c.json({
      labelId: label.id,
      labelName: label.name,
      storyCount,
      epic,
    });
  });

  return app;
}
