import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareTurnstileVerifier } from "../src/infrastructure/turnstile/cloudflare-turnstile-verifier";

const input = {
  token: "token",
  hostname: "app.example",
  action: "onboarding",
};

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => Response.json(body, { status }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CloudflareTurnstileVerifier", () => {
  it("calls the global fetch without the verifier as its receiver", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(
        Response.json({
          success: true,
          hostname: "app.example",
          action: "onboarding",
        }),
      );
    });
    const verifier = new CloudflareTurnstileVerifier("secret");

    await expect(verifier.verify(input)).resolves.toBe(true);
  });

  it("accepts a successful verification for the same hostname and action", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verifier = new CloudflareTurnstileVerifier(
      "secret",
      respond({ success: true, hostname: "app.example", action: "onboarding" }),
    );

    await expect(verifier.verify(input)).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs the Siteverify error codes without secrets when verification fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verifier = new CloudflareTurnstileVerifier(
      "secret-value",
      respond({ success: false, "error-codes": ["invalid-input-secret"] }),
    );

    await expect(verifier.verify(input)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith("Turnstile verification rejected", {
      success: false,
      errorCodes: ["invalid-input-secret"],
      hostnameMatches: false,
      actionMatches: false,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-value");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("token");
  });

  it("reports a hostname mismatch separately from the success flag", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verifier = new CloudflareTurnstileVerifier(
      "secret",
      respond({
        success: true,
        hostname: "other.example",
        action: "onboarding",
      }),
    );

    await expect(verifier.verify(input)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith("Turnstile verification rejected", {
      success: true,
      errorCodes: [],
      hostnameMatches: false,
      actionMatches: true,
    });
  });

  it("rejects when Siteverify answers with an HTTP error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verifier = new CloudflareTurnstileVerifier(
      "secret",
      respond({}, 500),
    );

    await expect(verifier.verify(input)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith("Turnstile Siteverify request failed", {
      status: 500,
    });
  });
});
