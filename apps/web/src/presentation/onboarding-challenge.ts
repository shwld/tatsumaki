import type { OnboardingChallenge } from "../application/usecases/complete-onboarding";
import { CloudflareTurnstileVerifier } from "../infrastructure/turnstile/cloudflare-turnstile-verifier";
import type { Bindings } from "../index";

// Hosted deployments (ENTITLEMENT_MODE=control-plane) must never register users
// without a challenge, so incomplete configuration fails closed there.
export function resolveOnboardingChallenge(env: Bindings): {
  challenge: OnboardingChallenge;
  siteKey: string | null;
} {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || null;
  const secret = env.TURNSTILE_SECRET_KEY?.trim() || null;

  if (siteKey && secret) {
    return {
      challenge: {
        kind: "enabled",
        verifier: new CloudflareTurnstileVerifier(secret),
      },
      siteKey,
    };
  }
  if (env.ENTITLEMENT_MODE === "control-plane") {
    return { challenge: { kind: "unavailable" }, siteKey: null };
  }
  return { challenge: { kind: "disabled" }, siteKey: null };
}
