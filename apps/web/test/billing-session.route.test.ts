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

describe("billing checkout and portal routes", () => {
  it("creates a checkout session with redirect URLs on the request origin", async () => {
    const createCheckoutSession = vi.fn(async () => ({
      url: "https://checkout.stripe.com/c/pay/cs_test",
    }));
    const response = await buildApp().request(
      "https://tatsumaki.example/billing/checkout",
      { method: "POST" },
      buildBindings({
        CHECKOUT_ENABLED: "true",
        CONTROL_PLANE: {
          getEntitlement: vi.fn(),
          createCheckoutSession,
          createPortalSession: vi.fn(),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test",
    });
    expect(createCheckoutSession).toHaveBeenCalledWith({
      billingAccountId: "user-1",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      successUrl: "https://tatsumaki.example/account?checkout=success",
      cancelUrl: "https://tatsumaki.example/account?checkout=cancel",
    });
  });

  it("does not call the Control Plane when checkout is disabled", async () => {
    const createCheckoutSession = vi.fn();
    const response = await buildApp().request(
      "https://tatsumaki.example/billing/checkout",
      { method: "POST" },
      buildBindings({
        CHECKOUT_ENABLED: "false",
        CONTROL_PLANE: {
          getEntitlement: vi.fn(),
          createCheckoutSession,
          createPortalSession: vi.fn(),
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("creates a portal session returning to the account page", async () => {
    const createPortalSession = vi.fn(async () => ({
      url: "https://billing.stripe.com/p/session/test",
    }));
    const response = await buildApp().request(
      "https://tatsumaki.example/billing/portal",
      { method: "POST" },
      buildBindings({
        CONTROL_PLANE: {
          getEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
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
          getEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
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
          getEntitlement: vi.fn(),
          createCheckoutSession: vi.fn(),
          createPortalSession: vi.fn(async () => ({
            url: "https://evil.example/p",
          })),
        },
      }),
    );

    expect(response.status).toBe(503);
  });
});
