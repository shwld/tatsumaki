import type {
  ArtifactObjectListPage,
  ArtifactObjectPrefixPage,
  ArtifactObjectStore,
  StoredArtifactObject,
} from "../../application/ports/artifact-object-store";

const DEFAULT_LIST_LIMIT = 1000;

export class InMemoryArtifactObjectStore implements ArtifactObjectStore {
  private readonly objects = new Map<string, Uint8Array>();

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer,
    _options: { contentType: string },
  ): Promise<void> {
    const buffer =
      body instanceof ArrayBuffer
        ? body
        : await new Response(body).arrayBuffer();
    this.objects.set(key, new Uint8Array(buffer));
  }

  async get(key: string): Promise<StoredArtifactObject | null> {
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      size: value.byteLength,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(value);
          controller.close();
        },
      }),
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async list(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectListPage> {
    const limit = options.limit ?? DEFAULT_LIST_LIMIT;
    const matching = [...this.objects.keys()]
      .filter((key) => key.startsWith(options.prefix))
      .filter((key) => options.cursor === undefined || key > options.cursor)
      .sort();
    const keys = matching.slice(0, limit);
    return {
      keys,
      cursor: matching.length > limit ? (keys[keys.length - 1] ?? null) : null,
    };
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }

  async listPrefixes(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectPrefixPage> {
    const limit = options.limit ?? DEFAULT_LIST_LIMIT;
    const prefixes = new Set<string>();
    for (const key of this.objects.keys()) {
      if (!key.startsWith(options.prefix)) continue;
      const rest = key.slice(options.prefix.length);
      const slash = rest.indexOf("/");
      if (slash >= 0)
        prefixes.add(`${options.prefix}${rest.slice(0, slash + 1)}`);
    }
    const sorted = [...prefixes]
      .sort()
      .filter(
        (prefix) => options.cursor === undefined || prefix > options.cursor,
      );
    const page = sorted.slice(0, limit);
    return {
      prefixes: page,
      cursor: sorted.length > limit ? (page[page.length - 1] ?? null) : null,
    };
  }
}
