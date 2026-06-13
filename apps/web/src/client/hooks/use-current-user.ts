import { useEffect, useState } from "react";
import type { CurrentUser } from "../types/current-user";

type UseCurrentUserResult = {
  user: CurrentUser | null;
  isLoading: boolean;
};

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const run = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          if (!ignore) {
            setUser(null);
          }
          return;
        }

        const data = (await response.json()) as CurrentUser;
        if (!ignore) {
          setUser(data);
        }
      } catch {
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      ignore = true;
    };
  }, []);

  return { user, isLoading };
}
