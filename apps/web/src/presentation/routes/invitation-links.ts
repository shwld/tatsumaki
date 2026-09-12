import { Hono } from "hono";
import {
  deriveInitialDisplayName,
  normalizeUserEmail,
} from "../../application/usecases/current-user-input";
import { hashInvitationLinkToken } from "../../application/usecases/invitation-link-crypto";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import type { Env } from "../../index";

export const invitationLinksRoute = new Hono<Env>();

invitationLinksRoute.post("/invitation-links/accept", async (c) => {
  let body: { token?: unknown };
  try {
    body = await c.req.json<{ token?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return c.json({ error: "This invitation link is invalid." }, 410);
  }

  const currentUser = c.get("currentUser");
  const emailResult = normalizeUserEmail(currentUser.email ?? "");
  if (emailResult.isErr()) {
    return c.json(
      { error: "Cloudflare Access did not provide an email." },
      400,
    );
  }

  const result = await new D1ProjectRepository(
    c.env.DB,
  ).acceptSingleUseInvitation({
    tokenHash: await hashInvitationLinkToken(token),
    userId: currentUser.id,
    email: emailResult.value,
    displayName: deriveInitialDisplayName(currentUser.id, emailResult.value),
  });
  if (result.isErr()) {
    return c.json({ error: "Failed to accept invitation" }, 500);
  }
  if (!result.value) {
    return c.json(
      { error: "This invitation link was used, revoked, or expired." },
      410,
    );
  }

  return c.json({
    projectId: result.value.invitation.projectId,
    member: result.value.member,
  });
});
