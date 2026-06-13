import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCurrentUser } from "./use-current-user";

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns user on successful fetch", async () => {
    const user = { id: "u1", email: "test@example.com", displayName: "Test" };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(user), { status: 200 }),
    );

    const { result } = renderHook(() => useCurrentUser());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(user);
  });

  it("returns null on failed fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });
});
