import { Hono } from "hono";
import type { Env } from "../../index";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import { D1StoryMapRepository } from "../../infrastructure/db/repositories/d1-story-map-repository";
import { STORY_MAP_LIVE_LIMITS } from "../../shared/story-map-live-protocol";
import { isAllowedWebSocketOrigin } from "./planning-poker";

export const storyMapLiveRoute = new Hono<Env>();

// A non-member, a map of another project and a missing map get one response so
// the route does not reveal which story maps exist (ADR-0014 §4).
const notFound = () =>
  Response.json({ error: "Story map not found" }, { status: 404 });

storyMapLiveRoute.get(
  "/projects/:projectId/story-maps/:mapId/live",
  async (c) => {
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return c.json({ error: "Expected websocket" }, 426);
    }
    // Browsers always send Origin on the handshake. A missing Origin is a
    // non-browser client, which cannot carry a hijackable cookie session.
    if (!isAllowedWebSocketOrigin(c.req.header("origin"), c.req.url)) {
      return c.json({ error: "Forbidden origin" }, 403);
    }
    const projectId = c.req.param("projectId");
    const mapId = c.req.param("mapId");
    const currentUser = c.get("currentUser");

    const member = await new D1ProjectRepository(c.env.DB).findMember(
      projectId,
      currentUser.id,
    );
    if (member.isErr()) {
      return c.json({ error: "Failed to load project membership" }, 500);
    }
    if (!member.value) return notFound();

    const structure = await new D1StoryMapRepository(c.env.DB).getStructure(
      projectId,
      mapId,
    );
    if (structure.isErr()) {
      return c.json({ error: "Failed to load story map" }, 500);
    }
    if (!structure.value) return notFound();

    const stub = c.env.STORY_MAP_DO.get(c.env.STORY_MAP_DO.idFromName(mapId));
    const headers = new Headers(c.req.raw.headers);
    headers.set("x-user-id", currentUser.id);
    headers.set("x-member-role", member.value.role);
    headers.set("x-project-id", projectId);
    headers.set("x-map-id", mapId);
    return stub.fetch(new Request("https://story-map/live", { headers }));
  },
);

/**
 * HTTP write path: the command goes to the same Durable Object as the socket
 * commands, so it is serialized with live edits and shown to live editors.
 * Shared by the Web API and the programmatic API; mounted under ".../projects".
 */
export const storyMapCommandsRoute = new Hono<Env>();

storyMapCommandsRoute.post(
  "/:projectId/story-maps/:mapId/commands",
  async (c) => {
    const projectId = c.req.param("projectId");
    const mapId = c.req.param("mapId");
    const currentUser = c.get("currentUser");

    const member = await new D1ProjectRepository(c.env.DB).findMember(
      projectId,
      currentUser.id,
    );
    if (member.isErr()) {
      return c.json({ error: "Failed to load project membership" }, 500);
    }
    if (!member.value) return notFound();

    const structure = await new D1StoryMapRepository(c.env.DB).getStructure(
      projectId,
      mapId,
    );
    if (structure.isErr()) {
      return c.json({ error: "Failed to load story map" }, 500);
    }
    if (!structure.value) return notFound();

    const body = await readCappedBody(c.req.raw);
    if (body === null) {
      return c.json({ code: "invalid" }, 413);
    }
    const headers = new Headers({
      "content-type": "application/json",
      "x-user-id": currentUser.id,
      "x-member-role": member.value.role,
      "x-project-id": projectId,
      "x-map-id": mapId,
    });
    const stub = c.env.STORY_MAP_DO.get(c.env.STORY_MAP_DO.idFromName(mapId));
    return stub.fetch(
      new Request("https://story-map/command", {
        method: "POST",
        headers,
        body,
      }),
    );
  },
);

/** Reads at most the live message limit; null when the body is larger. */
async function readCappedBody(request: Request): Promise<string | null> {
  const max = STORY_MAP_LIVE_LIMITS.maxMessageBytes;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
