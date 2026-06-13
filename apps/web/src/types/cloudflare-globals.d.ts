// Minimal Cloudflare Worker bindings used by this codebase.
declare global {
  interface D1Database {
    prepare(query: string): unknown;
    batch(statements: unknown[]): Promise<unknown>;
    exec(query: string): Promise<unknown>;
  }

  interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }
}

export {};
