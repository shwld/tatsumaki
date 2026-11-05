import type { MiddlewareHandler } from "hono";
import { D1UserRepository } from "../../infrastructure/db/repositories/d1-user-repository";
import type { Env } from "../../index";

export type AppEntitlementDenial = {
  error: string;
  code: "ONBOARDING_REQUIRED" | "ACCOUNT_BLOCKED";
};

const ONBOARDING_REQUIRED: AppEntitlementDenial = {
  error: "Complete onboarding to use tatsumaki.",
  code: "ONBOARDING_REQUIRED",
};

const ACCOUNT_BLOCKED: AppEntitlementDenial = {
  error: "This account has been suspended.",
  code: "ACCOUNT_BLOCKED",
};

export async function getAppEntitlementDenial(
  db: D1Database,
  userId: string,
): Promise<AppEntitlementDenial | null> {
  const result = await new D1UserRepository(db).findById(userId);
  if (result.isErr() || !result.value) {
    return ONBOARDING_REQUIRED;
  }
  return result.value.accessStatus === "allowed" ? null : ACCOUNT_BLOCKED;
}

export const requireAppEntitlement = (): MiddlewareHandler<Env> => {
  return async (c, next) => {
    const denial = await getAppEntitlementDenial(
      c.env.DB,
      c.get("currentUser").id,
    );
    if (denial) {
      return c.json(denial, 403);
    }
    return next();
  };
};

// 招待受諾など onboarding 前でも通す経路向け。blocked だけは拒否する。
export const rejectBlockedUser = (): MiddlewareHandler<Env> => {
  return async (c, next) => {
    const denial = await getAppEntitlementDenial(
      c.env.DB,
      c.get("currentUser").id,
    );
    if (denial?.code === "ACCOUNT_BLOCKED") {
      return c.json(denial, 403);
    }
    return next();
  };
};
