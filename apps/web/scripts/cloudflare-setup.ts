import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(SCRIPT_DIR, "..");

export type SetupOptions = {
  accountId?: string;
  apiToken?: string;
  teamDomain?: string;
  allowEmails: string[];
  allowDomains: string[];
  withStaging: boolean;
  stagingOnly: boolean;
  dryRun: boolean;
  namePrefix: string;
};

export type EnvironmentPlan = {
  environment: "production" | "staging";
  workerName: string;
  d1Name: string;
  kvName: string;
  storyAttachmentsBucket: string;
  userAvatarsBucket: string;
  accessName: string;
  accessPolicyName: string;
};

export type EnvironmentSelection =
  | "production"
  | "production-and-staging"
  | "staging";

type ApiEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: { page?: number; total_pages?: number; cursor?: string };
};

type NamedId = { id: string; name?: string; title?: string };
type D1Database = { uuid: string; name?: string };
type AccessApplication = NamedId & {
  aud: string;
  domain?: string;
  destinations?: Array<{ type: string; worker_id?: string; uri?: string }>;
};
type AccessPolicy = NamedId & { decision?: string; include?: unknown[] };

export type SetupDependencies = {
  fetch?: typeof fetch;
  runCommand?: (
    command: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ) => Promise<void>;
  log?: (message: string) => void;
};

export function buildEnvironmentPlans(
  namePrefix: string,
  selection: EnvironmentSelection,
): EnvironmentPlan[] {
  const build = (environment: "production" | "staging"): EnvironmentPlan => {
    const base =
      environment === "production" ? namePrefix : `${namePrefix}-staging`;
    return {
      environment,
      workerName: base,
      d1Name: `${base}-db`,
      kvName: `${base}-oauth-kv`,
      storyAttachmentsBucket: `${base}-story-attachments`,
      userAvatarsBucket: `${base}-user-avatars`,
      accessName: base,
      accessPolicyName: `${base} allowed users`,
    };
  };

  if (selection === "staging") return [build("staging")];
  if (selection === "production-and-staging") {
    return [build("production"), build("staging")];
  }
  return [build("production")];
}

export function resolveEnvironmentSelection(
  options: Pick<SetupOptions, "withStaging" | "stagingOnly">,
): EnvironmentSelection {
  if (options.withStaging && options.stagingOnly) {
    throw new Error(
      "--with-staging and --staging-only cannot be used together.",
    );
  }
  if (options.stagingOnly) return "staging";
  if (options.withStaging) return "production-and-staging";
  return "production";
}

export function validateSetupOptions(options: SetupOptions): void {
  const environmentSelection = resolveEnvironmentSelection(options);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.namePrefix)) {
    throw new Error(
      "--name-prefix must be 3-63 lowercase letters, numbers, or hyphens.",
    );
  }
  if (options.allowEmails.length === 0 && options.allowDomains.length === 0) {
    throw new Error(
      "Specify at least one --allow-email or --allow-domain for Cloudflare Access.",
    );
  }
  for (const email of options.allowEmails) {
    if (!email.includes("@"))
      throw new Error(`Invalid email address: ${email}`);
  }
  for (const domain of options.allowDomains) {
    if (!domain.includes("."))
      throw new Error(`Invalid email domain: ${domain}`);
  }
  for (const plan of buildEnvironmentPlans(
    options.namePrefix,
    environmentSelection,
  )) {
    for (const name of [
      plan.workerName,
      plan.d1Name,
      plan.kvName,
      plan.storyAttachmentsBucket,
      plan.userAvatarsBucket,
    ]) {
      if (name.length > 63)
        throw new Error(
          `Generated resource name exceeds 63 characters: ${name}`,
        );
    }
  }
  if (!options.dryRun) {
    if (!options.accountId)
      throw new Error("CLOUDFLARE_ACCOUNT_ID is required.");
    if (!options.apiToken) throw new Error("CLOUDFLARE_API_TOKEN is required.");
    if (!options.teamDomain)
      throw new Error("CLOUDFLARE_ACCESS_TEAM_DOMAIN is required.");
  }
}

export async function setupCloudflare(
  options: SetupOptions,
  dependencies: SetupDependencies = {},
): Promise<void> {
  validateSetupOptions(options);
  const log = dependencies.log ?? console.log;
  const plans = buildEnvironmentPlans(
    options.namePrefix,
    resolveEnvironmentSelection(options),
  );

  for (const plan of plans) {
    log(`\n[${plan.environment}]`);
    log(`Worker: ${plan.workerName}`);
    log(`D1: ${plan.d1Name}`);
    log(`KV: ${plan.kvName}`);
    log(`R2: ${plan.storyAttachmentsBucket}, ${plan.userAvatarsBucket}`);
    log(`Access: ${plan.accessName}`);
  }
  log(`Allowed emails: ${options.allowEmails.join(", ") || "none"}`);
  log(`Allowed email domains: ${options.allowDomains.join(", ") || "none"}`);

  if (options.dryRun) {
    log(
      "\nDry run complete. Cloudflare was not contacted and no resources were changed.",
    );
    return;
  }

  const accountId = options.accountId as string;
  const apiToken = options.apiToken as string;
  const teamDomain = normalizeTeamDomain(options.teamDomain as string);
  const client = new CloudflareClient(
    accountId,
    apiToken,
    dependencies.fetch ?? fetch,
  );
  const runCommand = dependencies.runCommand ?? defaultRunCommand;

  log("\nBuilding the web application...");
  await runCommand(["bun", "run", "build:client"], { cwd: WEB_DIR });

  for (const plan of plans) {
    log(`\nProvisioning ${plan.environment}...`);
    const d1 = await client.ensureD1(plan.d1Name);
    const kv = await client.ensureKv(plan.kvName);
    await client.ensureR2(plan.storyAttachmentsBucket);
    await client.ensureR2(plan.userAvatarsBucket);

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "tatsumaki-cloudflare-"),
    );
    const configPath = join(temporaryDirectory, "wrangler.toml");
    const secretPath = join(temporaryDirectory, "secrets.json");
    try {
      await writeFile(configPath, renderWranglerConfig(plan, d1.uuid, kv.id), {
        mode: 0o600,
      });
      const wranglerEnv = {
        CLOUDFLARE_API_TOKEN: apiToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      };
      await runCommand(
        [
          "bun",
          "run",
          "wrangler",
          "d1",
          "migrations",
          "apply",
          "DB",
          "--remote",
          "--config",
          configPath,
        ],
        {
          cwd: WEB_DIR,
          env: wranglerEnv,
        },
      );
      await runCommand(
        [
          "bun",
          "run",
          "wrangler",
          "deploy",
          "--keep-vars",
          "--config",
          configPath,
        ],
        {
          cwd: WEB_DIR,
          env: wranglerEnv,
        },
      );

      const workersSubdomain = await client.getWorkersSubdomain();
      const workerDomain = `${plan.workerName}.${workersSubdomain}.workers.dev`;
      const workerId = await client.getWorkerId(plan.workerName);
      const application = await client.ensureAccessApplication(
        plan,
        workerDomain,
        workerId,
      );
      await client.ensureAccessPolicy(
        application.id,
        plan.accessPolicyName,
        options.allowEmails,
        options.allowDomains,
      );

      await writeFile(
        secretPath,
        `${JSON.stringify({ ACCESS_AUD: application.aud, ACCESS_TEAM_DOMAIN: teamDomain }, null, 2)}\n`,
        { mode: 0o600 },
      );
      await runCommand(
        [
          "bun",
          "run",
          "wrangler",
          "secret",
          "bulk",
          secretPath,
          "--config",
          configPath,
        ],
        {
          cwd: WEB_DIR,
          env: wranglerEnv,
        },
      );
      log(`Ready: https://${workerDomain}`);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export function renderWranglerConfig(
  plan: EnvironmentPlan,
  d1Id: string,
  kvId: string,
): string {
  const toml = (value: string) => JSON.stringify(value);
  return `"$schema" = ${toml(join(WEB_DIR, "node_modules/wrangler/config-schema.json"))}
name = ${toml(plan.workerName)}
main = ${toml(join(WEB_DIR, "src/index.ts"))}
compatibility_date = "2025-03-05"
compatibility_flags = ["global_fetch_strictly_public"]
keep_vars = true

[assets]
directory = ${toml(join(WEB_DIR, "dist/client"))}
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = ${toml(plan.d1Name)}
database_id = ${toml(d1Id)}
migrations_dir = ${toml(join(WEB_DIR, "migrations"))}

[[kv_namespaces]]
binding = "OAUTH_KV"
id = ${toml(kvId)}

[[r2_buckets]]
binding = "STORY_ATTACHMENTS"
bucket_name = ${toml(plan.storyAttachmentsBucket)}

[[r2_buckets]]
binding = "USER_AVATARS"
bucket_name = ${toml(plan.userAvatarsBucket)}

[triggers]
crons = ["0 * * * *"]

[[durable_objects.bindings]]
name = "PLANNING_POKER_DO"
class_name = "PlanningPokerDO"

[[migrations]]
tag = "v1-planning-poker-do"
new_sqlite_classes = ["PlanningPokerDO"]
`;
}

class CloudflareClient {
  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly fetchImplementation: typeof fetch,
  ) {}

  async ensureD1(name: string): Promise<D1Database> {
    const existing = (
      await this.listAll<D1Database>(
        `d1/database?name=${encodeURIComponent(name)}`,
      )
    ).find((database) => database.name === name);
    if (existing) return existing;
    return this.createWithConflictRecovery("d1/database", { name }, () =>
      this.findD1(name),
    );
  }

  async ensureKv(title: string): Promise<NamedId> {
    const existing = (
      await this.listAll<NamedId>("storage/kv/namespaces?per_page=100")
    ).find((namespace) => namespace.title === title);
    if (existing) return existing;
    return this.createWithConflictRecovery(
      "storage/kv/namespaces",
      { title },
      async () => {
        const namespaces = await this.listAll<NamedId>(
          "storage/kv/namespaces?per_page=100",
        );
        return namespaces.find((namespace) => namespace.title === title);
      },
    );
  }

  async ensureR2(name: string): Promise<void> {
    if ((await this.listR2Buckets()).some((bucket) => bucket.name === name))
      return;
    try {
      await this.request("r2/buckets", { method: "POST", body: { name } });
    } catch (error) {
      if ((await this.listR2Buckets()).some((bucket) => bucket.name === name))
        return;
      throw error;
    }
  }

  async getWorkersSubdomain(): Promise<string> {
    const result = await this.request<{ subdomain: string }>(
      "workers/subdomain",
    );
    if (!result.subdomain)
      throw new Error(
        "Cloudflare Workers subdomain is not enabled for this account.",
      );
    return result.subdomain;
  }

  async getWorkerId(name: string): Promise<string> {
    const workers = await this.listAll<{ id: string; name?: string }>(
      "workers/workers?per_page=100",
    );
    const worker = workers.find((candidate) => candidate.name === name);
    if (!worker) throw new Error(`Cloudflare Worker ${name} was not found.`);
    return worker.id;
  }

  async ensureAccessApplication(
    plan: EnvironmentPlan,
    domain: string,
    workerId: string,
  ): Promise<AccessApplication> {
    const applications = await this.listAll<AccessApplication>(
      "access/apps?per_page=100",
    );
    const existing = applications.find(
      (application) => application.name === plan.accessName,
    );
    const matchingDestination = applications.find((application) =>
      application.destinations?.some(
        (destination) =>
          destination.type === "worker" && destination.worker_id === workerId,
      ),
    );
    if (matchingDestination) return matchingDestination;
    if (existing) {
      throw new Error(
        `Access application ${plan.accessName} already exists but does not protect Worker ${plan.workerName}. Use a different --name-prefix or correct the existing application.`,
      );
    }

    return this.request<AccessApplication>("access/apps", {
      method: "POST",
      body: {
        name: plan.accessName,
        type: "self_hosted",
        domain,
        destinations: [
          { type: "worker", worker_id: workerId },
          { type: "public", uri: domain },
        ],
        session_duration: "24h",
        app_launcher_visible: true,
      },
    });
  }

  async ensureAccessPolicy(
    applicationId: string,
    name: string,
    allowEmails: string[],
    allowDomains: string[],
  ): Promise<void> {
    const include = [
      ...allowEmails.map((email) => ({ email: { email } })),
      ...allowDomains.map((domain) => ({ email_domain: { domain } })),
    ];
    const policies = await this.listAll<AccessPolicy>(
      `access/apps/${applicationId}/policies?per_page=100`,
    );
    const existing = policies.find((policy) => policy.name === name);
    const body = { name, decision: "allow", include, precedence: 1 };
    if (existing) {
      if (
        existing.decision === "allow" &&
        JSON.stringify(existing.include) === JSON.stringify(include)
      )
        return;
      await this.request(
        `access/apps/${applicationId}/policies/${existing.id}`,
        { method: "PUT", body },
      );
      return;
    }
    await this.request(`access/apps/${applicationId}/policies`, {
      method: "POST",
      body,
    });
  }

  private async findD1(name: string): Promise<D1Database | undefined> {
    const databases = await this.listAll<D1Database>(
      `d1/database?name=${encodeURIComponent(name)}`,
    );
    return databases.find((database) => database.name === name);
  }

  private async createWithConflictRecovery<T>(
    path: string,
    body: unknown,
    recover: () => Promise<T | undefined>,
  ): Promise<T> {
    try {
      return await this.request<T>(path, { method: "POST", body });
    } catch (error) {
      const existing = await recover();
      if (existing) return existing;
      throw error;
    }
  }

  private async listAll<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    while (true) {
      const separator = path.includes("?") ? "&" : "?";
      const envelope = await this.requestEnvelope<T[]>(
        `${path}${separator}page=${page}`,
      );
      results.push(...envelope.result);
      const totalPages = envelope.result_info?.total_pages ?? 1;
      if (page >= totalPages) return results;
      page += 1;
    }
  }

  private async listR2Buckets(): Promise<Array<{ name?: string }>> {
    const results: Array<{ name?: string }> = [];
    let cursor: string | undefined;
    do {
      const suffix = cursor
        ? `?per_page=100&cursor=${encodeURIComponent(cursor)}`
        : "?per_page=100";
      const envelope = await this.requestEnvelope<{
        buckets?: Array<{ name?: string }>;
      }>(`r2/buckets${suffix}`);
      results.push(...(envelope.result.buckets ?? []));
      cursor = envelope.result_info?.cursor || undefined;
    } while (cursor);
    return results;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    return (await this.requestEnvelope<T>(path, options)).result;
  }

  private async requestEnvelope<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<ApiEnvelope<T>> {
    const response = await this.fetchImplementation(
      `${API_BASE_URL}/accounts/${this.accountId}/${path}`,
      {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      },
    );
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !envelope.success) {
      const message = envelope.errors
        ?.map((error) => error.message ?? `code ${error.code}`)
        .join("; ");
      throw new Error(
        `Cloudflare API ${options.method ?? "GET"} ${path} failed (${response.status}): ${message ?? "unknown error"}`,
      );
    }
    return envelope;
  }
}

function normalizeTeamDomain(teamDomain: string): string {
  return teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function defaultRunCommand(
  command: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<void> {
  const child = spawn(command[0], command.slice(1), {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  const exitCode = await new Promise<number>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
  if (exitCode !== 0)
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}.`);
}
