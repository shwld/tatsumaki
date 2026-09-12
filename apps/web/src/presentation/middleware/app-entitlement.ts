import type { MiddlewareHandler } from "hono";
import { D1UserRepository } from "../../infrastructure/db/repositories/d1-user-repository";
import type { Env } from "../../index";

export async function isAppEntitled(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const result = await new D1UserRepository(db).findById(userId);
  return result.isOk() && result.value?.accessStatus === "allowed";
}

export const requireAppEntitlement = (): MiddlewareHandler<Env> => {
  return async (c, next) => {
    if (await isAppEntitled(c.env.DB, c.get("currentUser").id)) {
      return next();
    }
    return c.json(
      {
        error: "An invitation is required to use tatsumaki.",
        code: "INVITATION_REQUIRED",
      },
      403,
    );
  };
};
