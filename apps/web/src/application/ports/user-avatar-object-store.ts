export type StoredUserAvatarObject = {
  body: ReadableStream<Uint8Array>;
  httpEtag?: string;
  contentType?: string;
};

export interface UserAvatarObjectStore {
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string },
  ): Promise<void>;

  get(key: string): Promise<StoredUserAvatarObject | null>;

  delete(key: string): Promise<void>;
}
