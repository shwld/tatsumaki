import type {
  ArtifactObjectListPage,
  ArtifactObjectPrefixPage,
  ArtifactObjectStore,
  StoredArtifactObject,
} from "../../application/ports/artifact-object-store";

export class R2ArtifactObjectStore implements ArtifactObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer,
    options: { contentType: string },
  ): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: options.contentType },
    });
  }

  async get(key: string): Promise<StoredArtifactObject | null> {
    const object = await this.bucket.get(key);
    if (!object || !object.body) return null;
    return { body: object.body, size: object.size };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectListPage> {
    const result = await this.bucket.list({
      prefix: options.prefix,
      cursor: options.cursor,
      limit: options.limit,
    });
    return {
      keys: result.objects.map((object) => object.key),
      cursor: result.truncated ? result.cursor : null,
    };
  }

  async deleteMany(keys: string[]): Promise<void> {
    // R2 accepts at most 1000 keys per delete call.
    for (let index = 0; index < keys.length; index += 1000) {
      await this.bucket.delete(keys.slice(index, index + 1000));
    }
  }

  async listPrefixes(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectPrefixPage> {
    const result = await this.bucket.list({
      prefix: options.prefix,
      delimiter: "/",
      cursor: options.cursor,
      limit: options.limit,
    });
    return {
      prefixes: result.delimitedPrefixes,
      cursor: result.truncated ? result.cursor : null,
    };
  }
}
