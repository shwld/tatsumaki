import type { MiddlewareHandler } from "hono";
import type { Env } from "../../index";
import { D1ProjectRepository } from "../../infrastructure/db/repositories/d1-project-repository";
import {
  decideProjectWrite,
  isProjectWriteEnforced,
  toProjectWriteDenial,
} from "../../infrastructure/entitlements/project-write-guard";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PREVIEW_TOKEN_PATH =
  /^\/artifacts\/[^/]+\/versions\/[^/]+\/preview-token$/;
// 課金の回復・譲渡の経路は停止中でも通す。ゲートの対象は /projects/:id 配下だけ。
const BILLING_PROJECT_PATH =
  /^(?:\/api)?\/billing\/projects\/[^/]+\/(?:resume|cancel|payment-method|ownership-transfer)(?:\/|$)/;
const PROJECT_PATH = /(?:^|\/)projects\/([^/]+)(\/.*)?$/;

/**
 * Rejects project writes of a suspended project (ADR-0015). Project
 * membership is checked first so a non-member learns nothing about the
 * project; the route's own authorization still runs afterwards. Owner delete
 * is allowed even when suspended.
 */
export const requireProjectWritable = (): MiddlewareHandler<Env> => {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method) || !isProjectWriteEnforced(c.env)) {
      return next();
    }
    if (BILLING_PROJECT_PATH.test(c.req.path)) return next();
    const match = PROJECT_PATH.exec(c.req.path);
    if (!match) return next();
    const projectId = decodeURIComponent(match[1]);
    if (c.req.method === "DELETE" && match[2] === undefined) return next();
    // Signs a read-only viewing token; viewing stays open (ADR-0015).
    if (match[2] && PREVIEW_TOKEN_PATH.test(match[2])) return next();
    // A key is bound to one project; other projects get the route's own answer.
    const keyProjectId = c.get("apiKeyProjectId");
    if (keyProjectId !== undefined && keyProjectId !== projectId) return next();

    const member = await new D1ProjectRepository(c.env.DB).findMember(
      projectId,
      c.get("currentUser").id,
    );
    if (member.isOk() && !member.value) return next();

    const denial = toProjectWriteDenial(
      await decideProjectWrite(c.env, projectId),
    );
    if (denial) return c.json(denial.body, denial.status);
    return next();
  };
};
