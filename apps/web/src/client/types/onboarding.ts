export type OnboardingChallenge =
  | { kind: "disabled" | "unavailable"; siteKey: null }
  | { kind: "enabled"; siteKey: string };

export type OnboardingState = {
  completed: boolean;
  email: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  challenge: OnboardingChallenge;
};
