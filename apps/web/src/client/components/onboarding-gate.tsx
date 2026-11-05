import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OnboardingScreen } from "../screens/onboarding-screen";
import type { OnboardingState } from "../types/onboarding";

type GateState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "onboarding"; state: OnboardingState }
  | { kind: "error" };

// The server is the source of truth: until onboarding completes, every other
// API answers 403 ONBOARDING_REQUIRED, so the gate only decides what to render.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [gate, setGate] = useState<GateState>({ kind: "loading" });

  const load = useCallback(async (isCancelled: () => boolean) => {
    try {
      const response = await fetch("/api/onboarding");
      if (!response.ok) throw new Error(String(response.status));
      const state = (await response.json()) as OnboardingState;
      if (!isCancelled()) {
        setGate(
          state.completed ? { kind: "ready" } : { kind: "onboarding", state },
        );
      }
    } catch {
      if (!isCancelled()) setGate({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (gate.kind === "ready") return <>{children}</>;
  if (gate.kind === "onboarding") {
    return (
      <OnboardingScreen
        state={gate.state}
        onCompleted={() => setGate({ kind: "ready" })}
      />
    );
  }
  if (gate.kind === "error") {
    return (
      <p className="p-4 text-sm text-red-600" role="alert">
        {t("onboardingScreen.loadError")}
      </p>
    );
  }
  return null;
}
