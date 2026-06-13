import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./use-theme";

type MatchMediaChangeListener = (event: MediaQueryListEvent) => void;

function createMatchMediaController(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaChangeListener>();

  const matchMediaMock = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: string, listener: MatchMediaChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _event: string,
      listener: MatchMediaChangeListener,
    ) => {
      listeners.delete(listener);
    },
  }));

  return {
    matchMediaMock,
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function ThemeHarness() {
  const { mode, setMode } = useTheme();
  return (
    <div>
      <p data-testid="mode">{mode}</p>
      <button type="button" onClick={() => setMode("light")}>
        light
      </button>
      <button type="button" onClick={() => setMode("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setMode("system")}>
        system
      </button>
    </div>
  );
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to system mode and applies system preference", async () => {
    const media = createMatchMediaController(false);
    vi.stubGlobal("matchMedia", media.matchMediaMock);

    render(<ThemeHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("mode")).toHaveTextContent("system");
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("persists explicit mode to localStorage", async () => {
    const media = createMatchMediaController(false);
    vi.stubGlobal("matchMedia", media.matchMediaMock);

    render(<ThemeHarness />);
    fireEvent.click(screen.getByText("dark"));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(localStorage.getItem("tatsumaki:theme-mode")).toBe("dark");
    });
  });

  it("reacts to system theme changes when mode is system", async () => {
    const media = createMatchMediaController(false);
    vi.stubGlobal("matchMedia", media.matchMediaMock);

    render(<ThemeHarness />);
    fireEvent.click(screen.getByText("system"));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    media.setMatches(true);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });
});
