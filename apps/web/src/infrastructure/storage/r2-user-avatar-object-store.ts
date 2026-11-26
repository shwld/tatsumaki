import type { SweepableObjectStore } from "../../application/ports/sweepable-object-store";
import type {
  StoredUserAvatarObject,
  UserAvatarObjectStore,
} from "../../application/ports/user-avatar-object-store";
import { USER_AVATAR_KEY_PREFIX } from "../../domain/users/user-avatar-key";
import { deleteManyFromR2 } from "./r2-delete-many";

export class R2UserAvatarObjectStore
  implements UserAvatarObjectStore, SweepableObjectStore
{
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

  async listAfter(options: { startAfter: string | null; limit: number }) {
    const result = await this.bucket.list({
      prefix: USER_AVATAR_KEY_PREFIX,
      startAfter: options.startAfter ?? undefined,
      limit: options.limit,
    });
    return {
      objects: result.objects.map((object) => ({
        key: object.key,
        uploadedAt: object.uploaded,
      })),
      truncated: result.truncated,
    };
  }

  async deleteMany(keys: string[]): Promise<void> {
    await deleteManyFromR2(this.bucket, keys);
  }
}
