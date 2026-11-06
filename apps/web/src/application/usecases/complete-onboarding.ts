import { err, ok, type Result } from "neverthrow";
import type { User } from "../../domain/entities/user";
import type {
  UserRepository,
  UserRepositoryError,
} from "../../domain/repositories/user-repository";
import type { TurnstileVerifier } from "../ports/turnstile-verifier";
import {
  deriveInitialDisplayName,
  normalizeUserEmail,
} from "./current-user-input";

export const ONBOARDING_ACTION = "onboarding";

export const TERMS_VERSION = "2026-11-06";

export const ONBOARDING_EMAIL_REQUIRED_ERROR =
  "ONBOARDING_EMAIL_REQUIRED_ERROR" as const;
export const ONBOARDING_TERMS_NOT_ACCEPTED_ERROR =
  "ONBOARDING_TERMS_NOT_ACCEPTED_ERROR" as const;
export const ONBOARDING_CHALLENGE_UNAVAILABLE_ERROR =
  "ONBOARDING_CHALLENGE_UNAVAILABLE_ERROR" as const;
export const ONBOARDING_CHALLENGE_FAILED_ERROR =
  "ONBOARDING_CHALLENGE_FAILED_ERROR" as const;

export type CompleteOnboardingError =
  | typeof ONBOARDING_EMAIL_REQUIRED_ERROR
  | typeof ONBOARDING_TERMS_NOT_ACCEPTED_ERROR
  | typeof ONBOARDING_CHALLENGE_UNAVAILABLE_ERROR
  | typeof ONBOARDING_CHALLENGE_FAILED_ERROR
  | UserRepositoryError;

export type OnboardingChallenge =
  | { kind: "disabled" }
  | { kind: "unavailable" }
  | { kind: "enabled"; verifier: TurnstileVerifier };

export async function completeOnboarding(
  repository: UserRepository,
  challenge: OnboardingChallenge,
  input: {
    id: string;
    accessEmail?: string;
    acceptedTerms: boolean;
    turnstileToken: string;
    hostname: string;
    remoteIp?: string;
  },
): Promise<Result<User, CompleteOnboardingError>> {
  const existing = await repository.findById(input.id);
  if (existing.isErr()) {
    return err(existing.error);
  }
  if (existing.value) {
    return ok(existing.value);
  }

  if (!input.acceptedTerms) {
    return err(ONBOARDING_TERMS_NOT_ACCEPTED_ERROR);
  }
  const email = normalizeUserEmail(input.accessEmail ?? "");
  if (email.isErr()) {
    return err(ONBOARDING_EMAIL_REQUIRED_ERROR);
  }

  if (challenge.kind === "unavailable") {
    return err(ONBOARDING_CHALLENGE_UNAVAILABLE_ERROR);
  }
  if (challenge.kind === "enabled") {
    const verified =
      input.turnstileToken !== "" &&
      (await challenge.verifier.verify({
        token: input.turnstileToken,
        hostname: input.hostname,
        action: ONBOARDING_ACTION,
        remoteIp: input.remoteIp,
      }));
    if (!verified) {
      return err(ONBOARDING_CHALLENGE_FAILED_ERROR);
    }
  }

  return repository.create({
    id: input.id,
    displayName: deriveInitialDisplayName(input.id, email.value),
    email: email.value,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: TERMS_VERSION,
  });
}
