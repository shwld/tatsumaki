import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Bindings, Env } from "../src/index";
import type { CurrentUser } from "../src/presentation/middleware/access-auth";
import { billingRoute } from "../src/presentation/routes/billing";

const buildApp = () => {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("currentUser", { id: "user-1" } as CurrentUser);
    await next();
  });
  app.route("/", billingRoute);
  return app;
};

const buildBindings = (overrides: Partial<Bindings>): Bindings =>
  ({ ENTITLEMENT_MODE: "control-plane", ...overrides }) as Bindings;

describe("billing portal route", () => {
  it("creates a portal session returning to the account page", async () => {
    const createPortalSession = vi.fn(async () => ({
      url: "https://billing.stripe.com/p/session/test",
    }));
    const response = await buildApp().request(
      "https://tatsumaki.example/billing/portal",
      { method: "POST" },
      buildBindings({
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          listProjectBilling: vi.fn(),
          createSubscriptionCancelSession: vi.fn(),
          createPortalSession,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(createPortalSession).toHaveBeenCalledWith({
      billingAccountId: "user-1",
      returnUrl: "https://tatsumaki.example/account",
    });
  });

  it("returns 503 when the Control Plane call fails", async () => {
    const response = await buildApp().request(
      "https://tatsumaki.example/billing/portal",
      { method: "POST" },
      buildBindings({
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          listProjectBilling: vi.fn(),
          createSubscriptionCancelSession: vi.fn(),
          createPortalSession: vi.fn(async () => {
            throw new Error("CUSTOMER_NOT_FOUND");
          }),
        },
      }),
    );

    expect(response.status).toBe(503);
  });

  it("rejects session URLs outside the Stripe hosts", async () => {
    const response = await buildApp().request(
      "https://tatsumaki.example/billing/portal",
      { method: "POST" },
      buildBindings({
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          listProjectBilling: vi.fn(),
          createSubscriptionCancelSession: vi.fn(),
          createPortalSession: vi.fn(async () => ({
            url: "https://evil.example/p",
          })),
        },
      }),
    );

    expect(response.status).toBe(503);
  });

  it("keeps the portal available while checkout is disabled and never logs the session URL", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = await buildApp().request(
      "https://tatsumaki.example/billing/portal",
      { method: "POST" },
      buildBindings({
        CHECKOUT_ENABLED: "false",
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          listProjectBilling: vi.fn(),
          createSubscriptionCancelSession: vi.fn(),
          createPortalSession: vi.fn(async () => ({
            url: "https://billing.stripe.com/p/session/ok",
          })),
        },
      }),
    );
    expect(ok.status).toBe(200);

    await buildApp().request(
      "https://tatsumaki.example/billing/portal",
      { method: "POST" },
      buildBindings({
        CONTROL_PLANE: {
          getProjectEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          listProjectBilling: vi.fn(),
          createSubscriptionCancelSession: vi.fn(),
          createPortalSession: vi.fn(async () => ({
            url: "https://evil.example/secret-token",
          })),
        },
      }),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-token");
    errorSpy.mockRestore();
  });
});
