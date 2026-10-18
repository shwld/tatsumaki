import type {
  ArtifactObjectListPage,
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
}
