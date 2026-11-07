import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  buildEnvironmentPlans,
  CloudflareClient,
  renderWranglerConfig,
  setupCloudflare,
  validateSetupOptions,
  type SetupOptions,
} from "../scripts/cloudflare-setup";
import { parseArguments } from "../scripts/setup-cloudflare";

const baseOptions: SetupOptions = {
  accountId: "account-id",
  apiToken: "api-token",
  teamDomain: "team.cloudflareaccess.com",
  allowEmails: ["owner@example.com"],
  allowDomains: [],
  withStaging: false,
  stagingOnly: false,
  dryRun: false,
  namePrefix: "tatsumaki",
  stagingControlPlaneService: undefined,
};

const bypassApp = (id: string, name: string, uri: string) => ({
  id,
  name,
  destinations: [{ type: "public", uri }],
});
const bypassPolicy = (id: string, name: string) => ({
  id,
  name,
  decision: "bypass",
  include: [{ everyone: {} }],
});
const WORKERS_DEV_BYPASS_URI =
  "tatsumaki.account-subdomain.workers.dev/artifact-content/*";

describe("Cloudflare self-hosting setup", () => {
  it("builds isolated production and staging resource names", () => {
    expect(
      buildEnvironmentPlans("tatsumaki", "production-and-staging"),
    ).toEqual([
      expect.objectContaining({
        environment: "production",
        workerName: "tatsumaki",
        d1Name: "tatsumaki-db",
        kvName: "tatsumaki-oauth-kv",
        storyAttachmentsBucket: "tatsumaki-story-attachments",
      }),
      expect.objectContaining({
        environment: "staging",
        workerName: "tatsumaki-staging",
        d1Name: "tatsumaki-staging-db",
        kvName: "tatsumaki-staging-oauth-kv",
        storyAttachmentsBucket: "tatsumaki-staging-story-attachments",
      }),
    ]);
  });

  it("builds only the staging plan when staging-only is selected", () => {
    expect(buildEnvironmentPlans("tatsumaki", "staging")).toEqual([
      expect.objectContaining({
        environment: "staging",
        workerName: "tatsumaki-staging",
        d1Name: "tatsumaki-staging-db",
        kvName: "tatsumaki-staging-oauth-kv",
        storyAttachmentsBucket: "tatsumaki-staging-story-attachments",
        userAvatarsBucket: "tatsumaki-staging-user-avatars",
        accessName: "tatsumaki-staging",
      }),
    ]);
  });

  it("renders resolved binding IDs into a temporary Wrangler configuration", () => {
    const [plan] = buildEnvironmentPlans("tatsumaki", "production");
    const config = renderWranglerConfig(plan, "d1-id", "kv-id");
    expect(config).toContain('"$schema" = ');
    expect(config).toContain('name = "tatsumaki"');
    expect(config).toContain('database_id = "d1-id"');
    expect(config).not.toContain("undefined");
    expect(config).toContain('id = "kv-id"');
    expect(config).toContain('bucket_name = "tatsumaki-user-avatars"');
    expect(config).toContain('binding = "ARTIFACTS"');
    expect(config).toContain('bucket_name = "tatsumaki-artifacts"');
    expect(config).not.toContain("api-token");
    expect(config).not.toContain("account-id");
    expect(config).not.toContain("CONTROL_PLANE");
    expect(config).toContain('run_worker_first = ["/", "/index.html"]');
  });

  it("runs the Worker first for every request when the content host is split (ADR-0012)", () => {
    const [plan] = buildEnvironmentPlans("tatsumaki", "production");
    const config = renderWranglerConfig(
      plan,
      "d1-id",
      "kv-id",
      undefined,
      true,
    );
    expect(config).toContain("run_worker_first = true");
  });

  it("renders a staging-only Control Plane Service Binding", () => {
    const [plan] = buildEnvironmentPlans("tatsumaki", "staging");
    const config = renderWranglerConfig(
      plan,
      "d1-id",
      "kv-id",
      "tatsumaki-control-plane-staging",
    );

    expect(config).toContain('binding = "CONTROL_PLANE"');
    expect(config).toContain('service = "tatsumaki-control-plane-staging"');
    expect(config).toContain('ENTITLEMENT_MODE = "control-plane"');
    expect(config).toContain('name = "ONBOARDING_RATE_LIMITER"');
    expect(config).toContain('name = "API_KEY_RATE_LIMITER"');
    expect(config).toContain('name = "OAUTH_REGISTER_RATE_LIMITER"');
  });

  it("does not contact Cloudflare or run commands in dry-run mode", async () => {
    const fetchMock = vi.fn();
    const runCommand = vi.fn();
    const messages: string[] = [];
    await setupCloudflare(
      {
        ...baseOptions,
        accountId: undefined,
        apiToken: undefined,
        teamDomain: undefined,
        dryRun: true,
        withStaging: true,
      },
      {
        fetch: fetchMock,
        runCommand,
        log: (message) => messages.push(message),
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
    expect(messages.join("\n")).toContain(
      "Dry run complete. Cloudflare was not contacted and no resources were changed.",
    );
  });

  it("creates missing resources, deploys, configures Access, and writes secrets", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const responses = [
      envelope([]),
      envelope({ uuid: "d1-id", name: "tatsumaki-db" }),
      envelope([]),
      envelope({ id: "kv-id", title: "tatsumaki-oauth-kv" }),
      envelope({ buckets: [] }),
      envelope({ id: "story-r2", name: "tatsumaki-story-attachments" }),
      envelope({ buckets: [] }),
      envelope({ id: "avatars-r2", name: "tatsumaki-user-avatars" }),
      envelope({ buckets: [] }),
      envelope({ id: "artifacts-r2", name: "tatsumaki-artifacts" }),
      envelope({ subdomain: "account-subdomain" }),
      envelope([{ id: "worker-id", name: "tatsumaki" }]),
      envelope([]),
      envelope({ id: "app-id", name: "tatsumaki", aud: "access-aud" }),
      envelope([]),
      envelope({ id: "policy-id", name: "tatsumaki allowed users" }),
      envelope([]),
      envelope({ id: "bypass-app-id", name: "tatsumaki artifact content" }),
      envelope([]),
      envelope({ id: "bypass-policy-id" }),
      // secrets left over from a previous --content-domain run are removed
      envelope({}),
      envelope({}),
    ];
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: input.toString(),
          method: init?.method ?? "GET",
          body:
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        });
        const response = responses.shift();
        if (!response) throw new Error("Unexpected request");
        return new Response(JSON.stringify(response), { status: 200 });
      },
    );
    const commands: string[][] = [];
    let generatedConfig = "";
    let generatedSecrets = "";
    await setupCloudflare(baseOptions, {
      fetch: fetchMock as typeof fetch,
      runCommand: async (command) => {
        commands.push(command);
        const configIndex = command.indexOf("--config");
        if (configIndex >= 0)
          generatedConfig = await readFile(command[configIndex + 1], "utf8");
        if (command.includes("bulk"))
          generatedSecrets = await readFile(command[5], "utf8");
      },
      log: () => undefined,
    });

    expect(responses).toHaveLength(0);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining("/storage/kv/namespaces"),
          method: "POST",
        }),
        expect.objectContaining({
          url: expect.stringContaining("/access/apps"),
          method: "POST",
          body: expect.objectContaining({
            destinations: [
              { type: "worker", worker_id: "worker-id" },
              {
                type: "public",
                uri: "tatsumaki.account-subdomain.workers.dev",
              },
            ],
            same_site_cookie_attribute: "lax",
            http_only_cookie_attribute: true,
          }),
        }),
        expect.objectContaining({
          url: expect.stringContaining("/access/apps"),
          method: "POST",
          body: expect.objectContaining({
            name: "tatsumaki artifact content",
            destinations: [
              {
                type: "public",
                uri: "tatsumaki.account-subdomain.workers.dev/artifact-content/*",
              },
            ],
          }),
        }),
        expect.objectContaining({
          url: expect.stringContaining("/access/apps/bypass-app-id/policies"),
          method: "POST",
          body: expect.objectContaining({
            decision: "bypass",
            include: [{ everyone: {} }],
          }),
        }),
        expect.objectContaining({
          url: expect.stringContaining("/access/apps/app-id/policies"),
          method: "POST",
          body: expect.objectContaining({
            include: [{ email: { email: "owner@example.com" } }],
          }),
        }),
      ]),
    );
    expect(commands.map((command) => command.join(" "))).toEqual([
      "bun run build:client",
      expect.stringContaining("wrangler d1 migrations apply DB --remote"),
      expect.stringContaining("wrangler deploy --keep-vars"),
      expect.stringContaining("wrangler secret bulk"),
    ]);
    expect(generatedConfig).toContain('database_id = "d1-id"');
    expect(JSON.parse(generatedSecrets)).toEqual({
      ACCESS_AUD: "access-aud",
      ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      ARTIFACT_CONTENT_SIGNING_KEY: expect.stringMatching(/^[\w-]{43}$/),
    });
    expect(generatedConfig).toContain(
      'run_worker_first = ["/", "/index.html"]',
    );
  });

  it("attaches the content domain and bypasses Access for its token path (ADR-0012)", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const responses = [
      envelope([]),
      envelope({ uuid: "d1-id", name: "tatsumaki-db" }),
      envelope([]),
      envelope({ id: "kv-id", title: "tatsumaki-oauth-kv" }),
      envelope({ buckets: [] }),
      envelope({ id: "story-r2", name: "tatsumaki-story-attachments" }),
      envelope({ buckets: [] }),
      envelope({ id: "avatars-r2", name: "tatsumaki-user-avatars" }),
      envelope({ buckets: [] }),
      envelope({ id: "artifacts-r2", name: "tatsumaki-artifacts" }),
      envelope({ subdomain: "account-subdomain" }),
      envelope([{ id: "worker-id", name: "tatsumaki" }]),
      envelope([]),
      envelope({ id: "app-id", name: "tatsumaki", aud: "access-aud" }),
      envelope([]),
      envelope({ id: "policy-id", name: "tatsumaki allowed users" }),
      // zone lookup: the full host has no zone, its parent does
      envelope([]),
      envelope([{ id: "zone-id", name: "content.example" }]),
      envelope({}),
      envelope([]),
      envelope({ id: "content-bypass-id", name: "x" }),
      envelope([]),
      envelope({ id: "content-policy-id" }),
    ];
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: input.toString(),
          method: init?.method ?? "GET",
          body:
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        });
        const response = responses.shift();
        if (!response) throw new Error("Unexpected request");
        return new Response(JSON.stringify(response), { status: 200 });
      },
    );
    let generatedSecrets = "";
    await setupCloudflare(
      { ...baseOptions, contentDomain: "app.content.example" },
      {
        fetch: fetchMock as typeof fetch,
        runCommand: async (command) => {
          if (command.includes("bulk"))
            generatedSecrets = await readFile(command[5], "utf8");
        },
        log: () => undefined,
      },
    );

    expect(responses).toHaveLength(0);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          destinations: [
            { type: "public", uri: "app.content.example/artifact-content/*" },
          ],
        }),
      }),
    );
    expect(
      calls.find((call) => call.url.includes("/workers/domains")),
    ).toMatchObject({
      method: "PUT",
      url: expect.stringContaining("/workers/domains"),
      body: {
        environment: "production",
        hostname: "app.content.example",
        service: "tatsumaki",
        zone_id: "zone-id",
      },
    });
    expect(JSON.parse(generatedSecrets)).toMatchObject({
      ARTIFACT_CONTENT_ORIGIN: "https://app.content.example",
      ARTIFACT_APP_ORIGIN: "https://tatsumaki.account-subdomain.workers.dev",
    });
  });

  it("rejects a content domain on the same site as the custom domain", () => {
    expect(() =>
      validateSetupOptions({
        ...baseOptions,
        customDomain: "tatsumaki.example.com",
        contentDomain: "content.tatsumaki.example.com",
      }),
    ).toThrow(/different registrable domain/);
  });

  it("reuses exact-name resources without issuing create requests", async () => {
    const responses = [
      envelope([{ uuid: "d1-id", name: "tatsumaki-db" }]),
      envelope([{ id: "kv-id", title: "tatsumaki-oauth-kv" }]),
      envelope({
        buckets: [
          { name: "tatsumaki-story-attachments" },
          { name: "tatsumaki-user-avatars" },
          { name: "tatsumaki-artifacts" },
        ],
      }),
      envelope({
        buckets: [
          { name: "tatsumaki-story-attachments" },
          { name: "tatsumaki-user-avatars" },
          { name: "tatsumaki-artifacts" },
        ],
      }),
      envelope({
        buckets: [
          { name: "tatsumaki-story-attachments" },
          { name: "tatsumaki-user-avatars" },
          { name: "tatsumaki-artifacts" },
        ],
      }),
      envelope({ subdomain: "account-subdomain" }),
      envelope([{ id: "worker-id", name: "tatsumaki" }]),
      envelope([
        {
          id: "app-id",
          name: "tatsumaki",
          aud: "access-aud",
          destinations: [{ type: "worker", worker_id: "worker-id" }],
        },
      ]),
      envelope([
        {
          id: "policy-id",
          name: "tatsumaki allowed users",
          decision: "allow",
          include: [{ email: { email: "owner@example.com" } }],
        },
      ]),
      envelope([
        bypassApp(
          "bypass-app-id",
          "tatsumaki artifact content",
          WORKERS_DEV_BYPASS_URI,
        ),
      ]),
      envelope([
        bypassPolicy("bypass-policy-id", "tatsumaki artifact content bypass"),
      ]),
      // secrets left over from a previous --content-domain run are removed
      envelope({}),
      envelope({}),
    ];
    const methods: string[] = [];
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        methods.push(init?.method ?? "GET");
        const response = responses.shift();
        if (!response) throw new Error("Unexpected request");
        return new Response(JSON.stringify(response), { status: 200 });
      },
    );

    await setupCloudflare(baseOptions, {
      fetch: fetchMock as typeof fetch,
      runCommand: async () => undefined,
      log: () => undefined,
    });

    expect(responses).toHaveLength(0);
    // Only reads, plus removal of leftover content-origin secrets.
    expect(methods.filter((method) => method !== "GET")).toEqual([
      "DELETE",
      "DELETE",
    ]);
    expect(methods.slice(0, -2).every((method) => method === "GET")).toBe(true);
  });

  it("provisions staging-only without touching production resources", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const responses = [
      envelope([]),
      envelope({ uuid: "staging-d1-id", name: "tatsumaki-staging-db" }),
      envelope([]),
      envelope({ id: "staging-kv-id", title: "tatsumaki-staging-oauth-kv" }),
      envelope({ buckets: [] }),
      envelope({ name: "tatsumaki-staging-story-attachments" }),
      envelope({ buckets: [] }),
      envelope({ name: "tatsumaki-staging-user-avatars" }),
      envelope({ buckets: [] }),
      envelope({ name: "tatsumaki-staging-artifacts" }),
      envelope({ subdomain: "account-subdomain" }),
      envelope([{ id: "staging-worker-id", name: "tatsumaki-staging" }]),
      envelope([]),
      envelope({
        id: "staging-app-id",
        name: "tatsumaki-staging",
        aud: "staging-access-aud",
      }),
      envelope([]),
      envelope({
        id: "staging-policy-id",
        name: "tatsumaki-staging allowed users",
      }),
      envelope([]),
      envelope({
        id: "bypass-app-id",
        name: "tatsumaki-staging artifact content",
      }),
      envelope([]),
      envelope({ id: "bypass-policy-id" }),
      // secrets left over from a previous --content-domain run are removed
      envelope({}),
      envelope({}),
    ];
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: input.toString(),
          method: init?.method ?? "GET",
          body:
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        });
        const response = responses.shift();
        if (!response) throw new Error("Unexpected request");
        return new Response(JSON.stringify(response), { status: 200 });
      },
    );
    const commands: string[][] = [];
    let generatedConfig = "";

    await setupCloudflare(
      {
        ...baseOptions,
        stagingOnly: true,
        stagingControlPlaneService: "tatsumaki-control-plane-staging",
      },
      {
        fetch: fetchMock as typeof fetch,
        runCommand: async (command) => {
          commands.push(command);
          const configIndex = command.indexOf("--config");
          if (configIndex >= 0)
            generatedConfig = await readFile(command[configIndex + 1], "utf8");
        },
        log: () => undefined,
      },
    );

    expect(responses).toHaveLength(0);
    expect(generatedConfig).toContain('name = "tatsumaki-staging"');
    expect(generatedConfig).toContain('database_name = "tatsumaki-staging-db"');
    expect(generatedConfig).toContain('binding = "CONTROL_PLANE"');
    expect(generatedConfig).toContain(
      'service = "tatsumaki-control-plane-staging"',
    );
    expect(generatedConfig).toContain('ENTITLEMENT_MODE = "control-plane"');
    expect(generatedConfig).not.toContain('name = "tatsumaki"\n');
    expect(calls.map((call) => JSON.stringify(call)).join("\n")).not.toMatch(
      /tatsumaki-(?:db|oauth-kv|story-attachments|user-avatars|artifacts)(?:["?}]|$)/,
    );
    expect(commands.map((command) => command.join(" "))).toEqual([
      "bun run build:client",
      expect.stringContaining("wrangler d1 migrations apply DB --remote"),
      expect.stringContaining("wrangler deploy --keep-vars"),
      expect.stringContaining("wrangler secret bulk"),
    ]);
  });

  it("parses repeatable Access allow rules and staging", () => {
    expect(
      parseArguments(
        [
          "--allow-email",
          "a@example.com",
          "--allow-domain",
          "example.org",
          "--with-staging",
        ],
        {
          CLOUDFLARE_ACCOUNT_ID: "account",
          CLOUDFLARE_API_TOKEN: "token",
          CLOUDFLARE_ACCESS_TEAM_DOMAIN: "team",
        },
      ),
    ).toEqual(
      expect.objectContaining({
        allowEmails: ["a@example.com"],
        allowDomains: ["example.org"],
        withStaging: true,
        stagingOnly: false,
      }),
    );
  });

  it("parses staging-only", () => {
    expect(
      parseArguments(
        [
          "--allow-email",
          "a@example.com",
          "--staging-only",
          "--staging-control-plane-service",
          "tatsumaki-control-plane-staging",
        ],
        {},
      ),
    ).toEqual(
      expect.objectContaining({
        withStaging: false,
        stagingOnly: true,
        stagingControlPlaneService: "tatsumaki-control-plane-staging",
      }),
    );
  });

  it("rejects a staging Control Plane binding in production-only mode", () => {
    expect(() =>
      validateSetupOptions({
        ...baseOptions,
        stagingControlPlaneService: "tatsumaki-control-plane-staging",
      }),
    ).toThrow("requires --with-staging or --staging-only");
  });

  it("parses custom domains", () => {
    expect(
      parseArguments(
        [
          "--allow-email",
          "a@example.com",
          "--custom-domain",
          "tatsumaki.example.com",
          "--staging-custom-domain",
          "staging.example.com",
        ],
        {},
      ),
    ).toEqual(
      expect.objectContaining({
        customDomain: "tatsumaki.example.com",
        stagingCustomDomain: "staging.example.com",
      }),
    );
  });

  it("rejects custom domains that are not bare hostnames", () => {
    expect(() =>
      validateSetupOptions({
        ...baseOptions,
        customDomain: "https://tatsumaki.example.com/",
      }),
    ).toThrow("bare hostname");
  });

  it("accepts Punycode top-level domains", () => {
    expect(() =>
      validateSetupOptions({
        ...baseOptions,
        customDomain: "tatsumaki.xn--p1ai",
      }),
    ).not.toThrow();
  });

  it("rejects malformed Punycode labels", () => {
    for (const customDomain of [
      "preview.xn--a",
      "preview.xn--a-",
      `preview.${"a".repeat(64)}`,
    ]) {
      expect(() =>
        validateSetupOptions({ ...baseOptions, customDomain }),
      ).toThrow("bare hostname");
    }
  });

  it("rejects a staging custom domain in production-only mode", () => {
    expect(() =>
      validateSetupOptions({
        ...baseOptions,
        stagingCustomDomain: "staging.example.com",
      }),
    ).toThrow("requires --with-staging or --staging-only");
  });

  it("creates an artifact-content bypass for the custom domain idempotently", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const bypassName = "tatsumaki artifact content (tatsumaki.example.com)";
    const responses = [
      envelope([]),
      envelope({ uuid: "d1-id", name: "tatsumaki-db" }),
      envelope([]),
      envelope({ id: "kv-id", title: "tatsumaki-oauth-kv" }),
      envelope({ buckets: [] }),
      envelope({ id: "story-r2", name: "tatsumaki-story-attachments" }),
      envelope({ buckets: [] }),
      envelope({ id: "avatars-r2", name: "tatsumaki-user-avatars" }),
      envelope({ buckets: [] }),
      envelope({ id: "artifacts-r2", name: "tatsumaki-artifacts" }),
      envelope({ subdomain: "account-subdomain" }),
      envelope([{ id: "worker-id", name: "tatsumaki" }]),
      envelope([
        {
          id: "app-id",
          name: "tatsumaki",
          aud: "access-aud",
          destinations: [{ type: "worker", worker_id: "worker-id" }],
        },
      ]),
      envelope([
        {
          id: "policy-id",
          name: "tatsumaki allowed users",
          decision: "allow",
          include: [{ email: { email: "owner@example.com" } }],
        },
      ]),
      envelope([
        bypassApp(
          "bypass-app-id",
          "tatsumaki artifact content",
          WORKERS_DEV_BYPASS_URI,
        ),
        bypassApp(
          "custom-bypass-id",
          bypassName,
          "tatsumaki.example.com/artifact-content/*",
        ),
      ]),
      envelope([
        bypassPolicy("bypass-policy-id", "tatsumaki artifact content bypass"),
      ]),
      envelope([
        bypassApp(
          "bypass-app-id",
          "tatsumaki artifact content",
          WORKERS_DEV_BYPASS_URI,
        ),
        bypassApp(
          "custom-bypass-id",
          bypassName,
          "tatsumaki.example.com/artifact-content/*",
        ),
      ]),
      envelope([bypassPolicy("custom-policy-id", `${bypassName} bypass`)]),
      // secrets left over from a previous --content-domain run are removed
      envelope({}),
      envelope({}),
    ];
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: input.toString(), method: init?.method ?? "GET" });
        const response = responses.shift();
        if (!response) throw new Error("Unexpected request");
        return new Response(JSON.stringify(response), { status: 200 });
      },
    );
    await setupCloudflare(
      { ...baseOptions, customDomain: "Tatsumaki.Example.com" },
      {
        fetch: fetchMock as typeof fetch,
        runCommand: async () => undefined,
        log: () => undefined,
      },
    );

    expect(responses).toHaveLength(0);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining(
            "/access/apps/custom-bypass-id/policies",
          ),
        }),
      ]),
    );
    expect(
      calls.filter(
        (call) => call.method !== "GET" && call.url.includes("/access/"),
      ),
    ).toEqual([]);
  });

  it("adopts a manually created custom-domain bypass by destination", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const responses = [
      envelope([
        {
          id: "manual-id",
          name: "my manual bypass",
          destinations: [
            { type: "public", uri: "tatsumaki.example.com/artifact-content/*" },
          ],
        },
      ]),
      envelope([
        {
          id: "manual-policy",
          name: "manual",
          decision: "bypass",
          include: [{ everyone: {} }],
        },
      ]),
    ];
    const client = new CloudflareClient("account-id", "api-token", (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: input.toString(), method: init?.method ?? "GET" });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as typeof fetch);
    const application = await client.ensureArtifactContentBypass(
      buildEnvironmentPlans("tatsumaki", "production")[0],
      "tatsumaki.example.com",
      { nameSuffix: " (tatsumaki.example.com)" },
    );
    expect(application.id).toBe("manual-id");
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("fails when the named bypass application does not cover the domain", async () => {
    const client = new CloudflareClient(
      "account-id",
      "api-token",
      (async () =>
        new Response(
          JSON.stringify(
            envelope([
              bypassApp(
                "drifted",
                "tatsumaki artifact content (a.example.com)",
                "other.example.com/artifact-content/*",
              ),
            ]),
          ),
          { status: 200 },
        )) as typeof fetch,
    );
    await expect(
      client.ensureArtifactContentBypass(
        buildEnvironmentPlans("tatsumaki", "production")[0],
        "a.example.com",
        { nameSuffix: " (a.example.com)" },
      ),
    ).rejects.toThrow("does not cover");
  });

  it("repairs a drifted named bypass policy in place", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const responses = [
      envelope([
        bypassApp("app", "tatsumaki artifact content", WORKERS_DEV_BYPASS_URI),
      ]),
      envelope([
        {
          id: "policy",
          name: "tatsumaki artifact content bypass",
          decision: "allow",
          include: [],
        },
      ]),
      envelope({ id: "policy" }),
    ];
    const client = new CloudflareClient("account-id", "api-token", (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: input.toString(), method: init?.method ?? "GET" });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as typeof fetch);
    await client.ensureArtifactContentBypass(
      buildEnvironmentPlans("tatsumaki", "production")[0],
      "tatsumaki.account-subdomain.workers.dev",
    );
    expect(calls.at(-1)).toEqual({
      url: expect.stringContaining("/access/apps/app/policies/policy"),
      method: "PUT",
    });
  });

  it("does not adopt an application that has additional destinations", async () => {
    const calls: Array<{ method: string; body?: unknown }> = [];
    const responses = [
      envelope([
        {
          id: "shared",
          name: "shared app",
          destinations: [
            { type: "public", uri: "tatsumaki.example.com/artifact-content/*" },
            { type: "public", uri: "tatsumaki.example.com/admin" },
          ],
        },
      ]),
      envelope({ id: "new-app" }),
      envelope([]),
      envelope({ id: "new-policy" }),
    ];
    const client = new CloudflareClient("account-id", "api-token", (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({
        method: init?.method ?? "GET",
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as typeof fetch);
    const application = await client.ensureArtifactContentBypass(
      buildEnvironmentPlans("tatsumaki", "production")[0],
      "tatsumaki.example.com",
      { nameSuffix: " (tatsumaki.example.com)" },
    );
    expect(application.id).toBe("new-app");
  });

  it("picks an unused precedence for a new bypass policy", async () => {
    const bodies: unknown[] = [];
    const responses = [
      envelope([
        bypassApp("app", "tatsumaki artifact content", WORKERS_DEV_BYPASS_URI),
      ]),
      envelope([
        {
          id: "other",
          name: "other",
          decision: "allow",
          include: [],
          precedence: 1,
        },
      ]),
      envelope({ id: "new" }),
    ];
    const client = new CloudflareClient("account-id", "api-token", (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as typeof fetch);
    await client.ensureArtifactContentBypass(
      buildEnvironmentPlans("tatsumaki", "production")[0],
      "tatsumaki.account-subdomain.workers.dev",
    );
    expect(bodies.at(-1)).toEqual(expect.objectContaining({ precedence: 2 }));
  });

  it("repairs a bypass policy that retains require constraints", async () => {
    const calls: string[] = [];
    const responses = [
      envelope([
        bypassApp("app", "tatsumaki artifact content", WORKERS_DEV_BYPASS_URI),
      ]),
      envelope([
        {
          ...bypassPolicy("policy", "tatsumaki artifact content bypass"),
          require: [{ email: { email: "a@example.com" } }],
        },
      ]),
      envelope({ id: "policy" }),
    ];
    const client = new CloudflareClient("account-id", "api-token", (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push(init?.method ?? "GET");
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }) as typeof fetch);
    await client.ensureArtifactContentBypass(
      buildEnvironmentPlans("tatsumaki", "production")[0],
      "tatsumaki.account-subdomain.workers.dev",
    );
    expect(calls.at(-1)).toBe("PUT");
  });

  it("rejects selecting both staging modes", () => {
    expect(() =>
      validateSetupOptions({
        ...baseOptions,
        withStaging: true,
        stagingOnly: true,
      }),
    ).toThrow("cannot be used together");
  });

  it("requires an explicit Access allow rule", () => {
    expect(() =>
      validateSetupOptions({ ...baseOptions, allowEmails: [] }),
    ).toThrow("--allow-email");
  });
});

function envelope(result: unknown): unknown {
  return {
    success: true,
    errors: [],
    result,
    result_info: { page: 1, total_pages: 1 },
  };
}
