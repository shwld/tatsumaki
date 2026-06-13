import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { saveReturnTo } from "../lib/api-error";

type AuthErrorState =
  | { kind: "none" }
  | { kind: "session-expired" }
  | { kind: "forbidden"; message: string };

type AuthErrorContextValue = {
  authError: AuthErrorState;
  notifySessionExpired: () => void;
  notifyForbidden: (message: string) => void;
  clearAuthError: () => void;
};

const AuthErrorContext = createContext<AuthErrorContextValue | null>(null);

export function AuthErrorProvider({ children }: { children: ReactNode }) {
  const [authError, setAuthError] = useState<AuthErrorState>({ kind: "none" });

  const notifySessionExpired = useCallback(() => {
    saveReturnTo();
    setAuthError({ kind: "session-expired" });
  }, []);

  const notifyForbidden = useCallback((message: string) => {
    setAuthError({ kind: "forbidden", message });
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError({ kind: "none" });
  }, []);

  return (
    <AuthErrorContext.Provider
      value={{
        authError,
        notifySessionExpired,
        notifyForbidden,
        clearAuthError,
      }}
    >
      {authError.kind === "session-expired" ? <SessionExpiredBanner /> : null}
      {children}
    </AuthErrorContext.Provider>
  );
}

export function useAuthError(): AuthErrorContextValue {
  const ctx = useContext(AuthErrorContext);
  if (!ctx) {
    throw new Error("useAuthError must be used within AuthErrorProvider");
  }
  return ctx;
}

function SessionExpiredBanner() {
  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800"
    >
      <p>
        Your session has expired. Please{" "}
        <a
          href="/cdn-cgi/access/login"
          className="font-semibold underline hover:text-amber-900"
        >
          log in again
        </a>{" "}
        to continue your work.
      </p>
    </div>
  );
}
