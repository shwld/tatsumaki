import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./onboarding-gate";

const mockFetch = (handler: (url: string, init?: RequestInit) => Response) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingGate", () => {
  it("renders children once onboarding is completed", async () => {
    mockFetch(() =>
      Response.json({
        completed: true,
        email: "a@example.com",
        challenge: { kind: "disabled", siteKey: null },
      }),
    );
    render(
      <OnboardingGate>
        <p>app</p>
      </OnboardingGate>,
    );
    expect(await screen.findByText("app")).toBeInTheDocument();
  });

  it("shows onboarding and reveals children after accepting the terms", async () => {
    const fetchMock = mockFetch((url, init) =>
      url === "/api/onboarding" && init?.method === "POST"
        ? Response.json({ completed: true })
        : Response.json({
            completed: false,
            email: "a@example.com",
            challenge: { kind: "disabled", siteKey: null },
          }),
    );
    render(
      <OnboardingGate>
        <p>app</p>
      </OnboardingGate>,
    );

    const submit = await screen.findByRole("button", {
      name: "利用を開始する",
    });
    expect(submit).toBeDisabled();
    expect(screen.queryByText("app")).toBeNull();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(submit);

    expect(await screen.findByText("app")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      acceptedTerms: true,
      turnstileToken: "",
    });
  });

  it("blocks submission when the hosted challenge is unavailable", async () => {
    mockFetch(() =>
      Response.json({
        completed: false,
        email: null,
        challenge: { kind: "unavailable", siteKey: null },
      }),
    );
    render(
      <OnboardingGate>
        <p>app</p>
      </OnboardingGate>,
    );
    await userEvent.click(await screen.findByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "利用を開始する" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows an error when onboarding state cannot be loaded", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));
    render(
      <OnboardingGate>
        <p>app</p>
      </OnboardingGate>,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("app")).toBeNull();
  });
});

describe("OnboardingGate retry", () => {
  it("retries loading the onboarding state after a failure", async () => {
    let calls = 0;
    mockFetch(() =>
      ++calls === 1
        ? new Response("boom", { status: 500 })
        : Response.json({
            completed: true,
            email: null,
            challenge: { kind: "disabled", siteKey: null },
          }),
    );
    render(
      <OnboardingGate>
        <p>app</p>
      </OnboardingGate>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "再試行" }),
    );
    expect(await screen.findByText("app")).toBeInTheDocument();
  });
});
