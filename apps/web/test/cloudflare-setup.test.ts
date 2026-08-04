import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  buildEnvironmentPlans,
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
};

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
    expect(config).not.toContain("api-token");
    expect(config).not.toContain("account-id");
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
      envelope({ subdomain: "account-subdomain" }),
      envelope([{ id: "worker-id", name: "tatsumaki" }]),
      envelope([]),
      envelope({ id: "app-id", name: "tatsumaki", aud: "access-aud" }),
      envelope([]),
      envelope({ id: "policy-id", name: "tatsumaki allowed users" }),
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
    });
  });

  it("reuses exact-name resources without issuing create requests", async () => {
    const responses = [
      envelope([{ uuid: "d1-id", name: "tatsumaki-db" }]),
      envelope([{ id: "kv-id", title: "tatsumaki-oauth-kv" }]),
      envelope({
        buckets: [
          { name: "tatsumaki-story-attachments" },
          { name: "tatsumaki-user-avatars" },
        ],
      }),
      envelope({
        buckets: [
          { name: "tatsumaki-story-attachments" },
          { name: "tatsumaki-user-avatars" },
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
    expect(methods).toEqual([
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
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
      { ...baseOptions, stagingOnly: true },
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
    expect(generatedConfig).not.toContain('name = "tatsumaki"\n');
    expect(calls.map((call) => JSON.stringify(call)).join("\n")).not.toMatch(
      /tatsumaki-(?:db|oauth-kv|story-attachments|user-avatars)(?:["?}]|$)/,
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
      parseArguments(["--allow-email", "a@example.com", "--staging-only"], {}),
    ).toEqual(
      expect.objectContaining({ withStaging: false, stagingOnly: true }),
    );
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
