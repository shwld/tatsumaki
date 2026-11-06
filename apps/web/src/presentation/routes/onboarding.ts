import { Hono } from "hono";
import {
  completeOnboarding,
  ONBOARDING_CHALLENGE_FAILED_ERROR,
  ONBOARDING_CHALLENGE_UNAVAILABLE_ERROR,
  ONBOARDING_EMAIL_REQUIRED_ERROR,
  ONBOARDING_TERMS_NOT_ACCEPTED_ERROR,
} from "../../application/usecases/complete-onboarding";
import { D1UserRepository } from "../../infrastructure/db/repositories/d1-user-repository";
import type { Env } from "../../index";
import { resolveOnboardingChallenge } from "../onboarding-challenge";

export const onboardingRoute = new Hono<Env>();

onboardingRoute.get("/onboarding", async (c) => {
  const found = await new D1UserRepository(c.env.DB).findById(
    c.get("currentUser").id,
  );
  if (found.isErr()) {
    return c.json({ error: "Failed to load onboarding state" }, 500);
  }
  const { challenge, siteKey } = resolveOnboardingChallenge(c.env);
  return c.json({
    completed: found.value !== null,
    email: c.get("currentUser").email ?? null,
    termsUrl: c.env.TERMS_URL?.trim() || null,
    privacyUrl: c.env.PRIVACY_URL?.trim() || null,
    challenge: {
      kind: challenge.kind,
      siteKey,
    },
  });
});

onboardingRoute.post("/onboarding", async (c) => {
  let body: { acceptedTerms?: unknown; turnstileToken?: unknown };
  try {
    body = await c.req.json<typeof body>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const currentUser = c.get("currentUser");
  const result = await completeOnboarding(
    new D1UserRepository(c.env.DB),
    resolveOnboardingChallenge(c.env).challenge,
    {
      id: currentUser.id,
      accessEmail: currentUser.email,
      acceptedTerms: body.acceptedTerms === true,
      turnstileToken:
        typeof body.turnstileToken === "string" ? body.turnstileToken : "",
      hostname: new URL(c.req.url).hostname,
      remoteIp: c.req.header("CF-Connecting-IP"),
    },
  );

  if (result.isOk()) {
    return c.json({ completed: true });
  }
  switch (result.error) {
    case ONBOARDING_TERMS_NOT_ACCEPTED_ERROR:
      return c.json(
        {
          error: "Accept the terms and privacy policy to continue.",
          code: "TERMS_NOT_ACCEPTED",
        },
        400,
      );
    case ONBOARDING_EMAIL_REQUIRED_ERROR:
      return c.json(
        { error: "Cloudflare Access did not provide an email." },
        400,
      );
    case ONBOARDING_CHALLENGE_FAILED_ERROR:
      return c.json(
        { error: "Bot verification failed.", code: "CHALLENGE_FAILED" },
        403,
      );
    case ONBOARDING_CHALLENGE_UNAVAILABLE_ERROR:
      return c.json(
        {
          error: "Registration is temporarily unavailable.",
          code: "ONBOARDING_UNAVAILABLE",
        },
        503,
      );
    default:
      return c.json({ error: "Failed to complete onboarding" }, 500);
  }
});
