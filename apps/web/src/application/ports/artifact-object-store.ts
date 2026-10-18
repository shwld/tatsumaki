export type StoredArtifactObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
};

export type ArtifactObjectListPage = {
  keys: string[];
  cursor: string | null;
};

export type ArtifactObjectPrefixPage = {
  /** Common prefixes ending with "/", e.g. "artifacts/{projectId}/". */
  prefixes: string[];
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

  /** Deletes many keys in one call; missing keys are ignored. */
  deleteMany(keys: string[]): Promise<void>;

  list(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectListPage>;

  /** Lists the first "/"-delimited level below `prefix`. */
  listPrefixes(options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<ArtifactObjectPrefixPage>;
}
