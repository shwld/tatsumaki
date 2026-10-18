export type StoredArtifactObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
};

export type ArtifactObjectListPage = {
  keys: string[];
  cursor: string | null;
};

export interface ArtifactObjectStore {
  put(
    key: string,
    body: ReadableStream<Uint8Array> | ArrayBuffer,
    options: { contentType: string },
  ): Promise<void>;

  get(key: string): Promise<StoredArtifactObject | null>;

  delete(key: string): Promise<void>;

  list(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectListPage>;
}
