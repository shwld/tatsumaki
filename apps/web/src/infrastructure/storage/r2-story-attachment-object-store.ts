import type { SweepableObjectStore } from "../../application/ports/sweepable-object-store";
import type {
  StoredStoryAttachmentObject,
  StoryAttachmentObjectStore,
} from "../../application/ports/story-attachment-object-store";
import { deleteManyFromR2 } from "./r2-delete-many";

export class R2StoryAttachmentObjectStore
  implements StoryAttachmentObjectStore, SweepableObjectStore
{
  constructor(
    private readonly bucket: R2Bucket,
    private readonly keyPrefix = "story-attachments",
  ) {}

  private resolveKey(key: string): string {
    return `${this.keyPrefix}/${key}`;
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string },
  ): Promise<void> {
    await this.bucket.put(this.resolveKey(key), body, {
      httpMetadata: {
        contentType: options.contentType,
      },
    });
  }

  async get(key: string): Promise<StoredStoryAttachmentObject | null> {
    const object = await this.bucket.get(this.resolveKey(key));
    if (!object || !object.body) {
      return null;
    }

    return {
      body: object.body,
      httpEtag: object.httpEtag,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(this.resolveKey(key));
  }

  async listAfter(options: { startAfter: string | null; limit: number }) {
    const prefix = this.resolveKey("");
    const result = await this.bucket.list({
      prefix,
      startAfter:
        options.startAfter === null
          ? undefined
          : this.resolveKey(options.startAfter),
      limit: options.limit,
    });
    return {
      objects: result.objects.map((object) => ({
        key: object.key.slice(prefix.length),
        uploadedAt: object.uploaded,
      })),
      truncated: result.truncated,
    };
  }

  async deleteMany(keys: string[]): Promise<void> {
    await deleteManyFromR2(
      this.bucket,
      keys.map((key) => this.resolveKey(key)),
    );
  }
}
