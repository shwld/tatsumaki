import type {
  StoredUserAvatarObject,
  UserAvatarObjectStore,
} from "../../application/ports/user-avatar-object-store";

export class R2UserAvatarObjectStore implements UserAvatarObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string },
  ): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType: options.contentType,
      },
    });
  }

  async get(key: string): Promise<StoredUserAvatarObject | null> {
    const object = await this.bucket.get(key);
    if (!object || !object.body) {
      return null;
    }

    return {
      body: object.body,
      httpEtag: object.httpEtag,
      contentType: object.httpMetadata?.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
