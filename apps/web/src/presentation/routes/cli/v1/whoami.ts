import { Hono } from "hono";
import { getOrCreateCurrentUser } from "../../../../application/usecases/get-or-create-current-user";
import { D1UserRepository } from "../../../../infrastructure/db/repositories/d1-user-repository";
import type { Env } from "../../../../index";

export const cliV1WhoamiRoute = new Hono<Env>();

cliV1WhoamiRoute.get("/", async (c) => {
  const currentUser = c.get("currentUser");
  const repository = new D1UserRepository(c.env.DB);
  const result = await getOrCreateCurrentUser(repository, {
    id: currentUser.id,
    accessEmail: currentUser.email,
  });

  if (result.isErr()) {
    return c.json({ error: "Failed to resolve current user" }, 500);
  }

  const user = result.value;
  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? user.email,
  });
});
