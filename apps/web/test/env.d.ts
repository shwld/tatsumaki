declare module "cloudflare:test" {
  type Bindings = import("../src/index").Bindings;
  type D1Migration = {
    name: string;
    queries: string[];
  };

  export const env: Bindings & { TEST_MIGRATIONS: D1Migration[] };
  export const SELF: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
  export function applyD1Migrations(
    db: D1Database,
    migrations: D1Migration[],
    migrationsTableName?: string,
  ): Promise<void>;

  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[];
  }
}
