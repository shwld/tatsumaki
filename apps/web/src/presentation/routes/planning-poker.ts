import { Hono } from "hono";
import type { Env } from "../../index";
import { requireProjectMembership } from "./project-membership";
import type { Context } from "hono";

export const planningPokerRoute = new Hono<Env>();

function getStub(c: Context<Env>, projectId: string) {
  const id = c.env.PLANNING_POKER_DO.idFromName(projectId);
  return c.env.PLANNING_POKER_DO.get(id);
}

async function proxy(c: Context<Env>, path: string, init?: RequestInit) {
  const projectId = c.req.param("projectId");
  if (!projectId) {
    return c.json({ error: "Project not found" }, 404);
  }
  const membership = await requireProjectMembership(c, projectId);
  if (!membership.ok) return membership.response;

  const currentUser = c.get("currentUser");
  const stub = getStub(c, projectId);
  return stub.fetch(
    new Request(`https://planning-poker${path}`, {
      method: init?.method ?? c.req.method,
      body: init?.body,
      headers: {
        "content-type": "application/json",
        "x-project-id": projectId,
        "x-user-id": currentUser.id,
        "x-user-email": currentUser.email ?? currentUser.id,
      },
    }),
  );
}

planningPokerRoute.get(
  "/projects/:projectId/planning-poker/sessions/active",
  async (c) => proxy(c, "/sessions/active"),
);
planningPokerRoute.post(
  "/projects/:projectId/planning-poker/sessions",
  async (c) =>
    proxy(c, "/sessions", { method: "POST", body: await c.req.text() }),
);
planningPokerRoute.get(
  "/projects/:projectId/planning-poker/sessions/:sessionId",
  async (c) => proxy(c, `/sessions/${c.req.param("sessionId")}`),
);
planningPokerRoute.post(
  "/projects/:projectId/planning-poker/sessions/:sessionId/votes",
  async (c) =>
    proxy(c, `/sessions/${c.req.param("sessionId")}/votes`, {
      method: "POST",
      body: await c.req.text(),
    }),
);
planningPokerRoute.post(
  "/projects/:projectId/planning-poker/sessions/:sessionId/reveal",
  async (c) =>
    proxy(c, `/sessions/${c.req.param("sessionId")}/reveal`, {
      method: "POST",
    }),
);
planningPokerRoute.post(
  "/projects/:projectId/planning-poker/sessions/:sessionId/apply",
  async (c) =>
    proxy(c, `/sessions/${c.req.param("sessionId")}/apply`, {
      method: "POST",
      body: await c.req.text(),
    }),
);
planningPokerRoute.post(
  "/projects/:projectId/planning-poker/sessions/:sessionId/close",
  async (c) =>
    proxy(c, `/sessions/${c.req.param("sessionId")}/close`, {
      method: "POST",
    }),
);
planningPokerRoute.post(
  "/projects/:projectId/planning-poker/sessions/:sessionId/reset",
  async (c) =>
    proxy(c, `/sessions/${c.req.param("sessionId")}/reset`, {
      method: "POST",
    }),
);
planningPokerRoute.get(
  "/projects/:projectId/planning-poker/sessions/:sessionId/ws",
  async (c) => {
    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({ error: "Project not found" }, 404);
    }
    const membership = await requireProjectMembership(c, projectId);
    if (!membership.ok) return membership.response;
    const currentUser = c.get("currentUser");
    const stub = getStub(c, projectId);
    // Preserve Upgrade headers from the original client handshake request.
    return stub.fetch(
      new Request(
        `https://planning-poker/ws?userId=${encodeURIComponent(currentUser.id)}`,
        c.req.raw,
      ),
    );
  },
);
