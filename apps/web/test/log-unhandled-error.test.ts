import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";
import { logUnhandledError } from "../src/presentation/lib/log-unhandled-error";

const buildApp = (error: Error) => {
  const child = new Hono<Env>();
  child.get("/items/:itemId", () => {
    throw error;
  });
  const app = new Hono<Env>();
  app.onError(logUnhandledError);
  app.route("/api", child);
  return app;
};

describe("logUnhandledError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs where it failed without the message or the concrete path", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await buildApp(
      new TypeError("Failed query\nparams: someone@example.com"),
    ).request("/api/items/secret-value?q=private");

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: "http.unhandled_error",
        method: "GET",
        route: "/api/items/:itemId",
        errorType: "TypeError",
      }),
    );
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("someone@example.com");
    expect(logged).not.toContain("secret-value");
    expect(logged).not.toContain("private");
  });

  it("keeps the response of an HTTPException", async () => {
    const response = await buildApp(new HTTPException(418)).request(
      "/api/items/1",
    );

    expect(response.status).toBe(418);
  });
});
