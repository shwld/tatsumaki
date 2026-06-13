import { Hono } from "hono";
import {
  assignStoryToIteration,
  calculateVelocity,
  deleteIterationUtilizationOverride,
  listIterationOverrides,
  listIterations,
  updateIterationUtilization,
  unassignStoryFromIteration,
} from "../../application/usecases/manage-iterations";
import {
  ensureIterationBurndownSnapshotToday,
  getBurndownChartPayload,
} from "../../application/usecases/burndown-chart";
import {
  isValidIsoDate,
  isValidSprintUtilizationPercent,
} from "../../domain/entities/iteration";
import { ITERATION_NOT_FOUND_ERROR } from "../../domain/repositories/iteration-repository";
import { D1IterationRepository } from "../../infrastructure/db/repositories/d1-iteration-repository";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";

export const iterationsRoute = new Hono<Env>();

iterationsRoute.get("/projects/:projectId/iterations", async (c) => {
  const projectId = c.req.param("projectId");
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) {
    return membership.response;
  }

  const repository = new D1IterationRepository(c.env.DB);
  const result = await listIterations(repository, projectId);

  if (result.isErr()) {
    return c.json({ error: "Failed to load iterations" }, 500);
  }

  const velocity = calculateVelocity(result.value);
  const overrides = await listIterationOverrides(repository, projectId);
  if (overrides.isErr()) {
    return c.json({ error: "Failed to load iteration overrides" }, 500);
  }

  return c.json({
    iterations: result.value,
    iterationOverrides: overrides.value,
    velocity,
  });
});

iterationsRoute.post(
  "/projects/:projectId/iterations/:iterationId/stories",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body !== "object" || body === null) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const raw = body as Record<string, unknown>;

    if (typeof raw.storyId !== "string") {
      return c.json({ error: "storyId is required" }, 400);
    }

    const repository = new D1IterationRepository(c.env.DB);
    const result = await assignStoryToIteration(repository, {
      projectId,
      iterationId: c.req.param("iterationId"),
      storyId: raw.storyId,
    });

    if (result.isErr()) {
      if (result.error === ITERATION_NOT_FOUND_ERROR) {
        return c.json({ error: "Iteration not found" }, 404);
      }
      return c.json({ error: "Failed to assign story" }, 500);
    }

    if (!result.value) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({ ok: true });
  },
);

iterationsRoute.patch(
  "/projects/:projectId/iterations/:iterationNumber/override",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (typeof body !== "object" || body === null) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const raw = body as Record<string, unknown>;
    const sprintUtilizationPercent =
      typeof raw.sprintUtilizationPercent === "number" &&
      isValidSprintUtilizationPercent(raw.sprintUtilizationPercent)
        ? raw.sprintUtilizationPercent
        : null;

    if (sprintUtilizationPercent === null) {
      return c.json(
        { error: "sprintUtilizationPercent must be 0-100 integer" },
        400,
      );
    }

    const iterationNumber = Number(c.req.param("iterationNumber"));
    if (!Number.isInteger(iterationNumber) || iterationNumber <= 0) {
      return c.json(
        { error: "iterationNumber must be a positive integer" },
        400,
      );
    }

    const hasStartDate = raw.iterationStartDate !== undefined;
    const hasEndDate = raw.iterationEndDate !== undefined;
    if (hasStartDate !== hasEndDate) {
      return c.json(
        {
          error:
            "iterationStartDate and iterationEndDate must be provided together",
        },
        400,
      );
    }
    let iterationStartDate: string | null | undefined;
    let iterationEndDate: string | null | undefined;
    if (hasStartDate && hasEndDate) {
      if (
        typeof raw.iterationStartDate !== "string" ||
        typeof raw.iterationEndDate !== "string" ||
        !isValidIsoDate(raw.iterationStartDate) ||
        !isValidIsoDate(raw.iterationEndDate)
      ) {
        return c.json(
          {
            error:
              "iterationStartDate and iterationEndDate must be YYYY-MM-DD strings",
          },
          400,
        );
      }
      if (raw.iterationStartDate >= raw.iterationEndDate) {
        return c.json(
          {
            error: "iterationStartDate must be before iterationEndDate",
          },
          400,
        );
      }
      iterationStartDate = raw.iterationStartDate;
      iterationEndDate = raw.iterationEndDate;
    }

    const repository = new D1IterationRepository(c.env.DB);
    if (sprintUtilizationPercent === 100) {
      const deleted = await deleteIterationUtilizationOverride(repository, {
        projectId,
        iterationNumber,
      });
      if (deleted.isErr()) {
        return c.json({ error: "Failed to reset iteration override" }, 500);
      }
      return c.json({
        ok: true,
        deleted: deleted.value,
        iterationOverride: null,
      });
    }

    const result = await updateIterationUtilization(repository, {
      projectId,
      iterationNumber,
      sprintUtilizationPercent,
      iterationStartDate,
      iterationEndDate,
    });

    if (result.isErr()) {
      return c.json({ error: "Failed to update iteration override" }, 500);
    }

    return c.json({ iterationOverride: result.value });
  },
);

iterationsRoute.delete(
  "/projects/:projectId/iterations/:iterationNumber/override",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const iterationNumber = Number(c.req.param("iterationNumber"));
    if (!Number.isInteger(iterationNumber) || iterationNumber <= 0) {
      return c.json(
        { error: "iterationNumber must be a positive integer" },
        400,
      );
    }

    const repository = new D1IterationRepository(c.env.DB);
    const result = await deleteIterationUtilizationOverride(repository, {
      projectId,
      iterationNumber,
    });

    if (result.isErr()) {
      return c.json({ error: "Failed to delete iteration override" }, 500);
    }

    return c.json({ ok: true, deleted: result.value });
  },
);

iterationsRoute.delete(
  "/projects/:projectId/iterations/:iterationId/stories/:storyId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const repository = new D1IterationRepository(c.env.DB);
    const result = await unassignStoryFromIteration(repository, {
      projectId,
      storyId: c.req.param("storyId"),
    });

    if (result.isErr()) {
      return c.json({ error: "Failed to unassign story" }, 500);
    }

    return c.json({ ok: true });
  },
);

iterationsRoute.get(
  "/projects/:projectId/iterations/:iterationId/burndown",
  async (c) => {
    const projectId = c.req.param("projectId");
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) {
      return membership.response;
    }

    const iterationId = c.req.param("iterationId");

    const snapshotResult = await ensureIterationBurndownSnapshotToday(
      c.env.DB,
      projectId,
      iterationId,
    );
    if (snapshotResult.isErr()) {
      if (snapshotResult.error === "iteration_not_found") {
        return c.json({ error: "Iteration not found" }, 404);
      }
      console.warn("burndown snapshot ensure failed", {
        projectId,
        iterationId,
        error: snapshotResult.error,
      });
    }

    const payload = await getBurndownChartPayload(
      c.env.DB,
      projectId,
      iterationId,
    );

    if (payload.isErr()) {
      if (payload.error === "iteration_not_found") {
        return c.json({ error: "Iteration not found" }, 404);
      }
      return c.json({ error: "Failed to load burndown data" }, 500);
    }

    return c.json(payload.value);
  },
);
