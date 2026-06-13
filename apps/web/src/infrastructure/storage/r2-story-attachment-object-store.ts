import type {
  StoredStoryAttachmentObject,
  StoryAttachmentObjectStore,
} from "../../application/ports/story-attachment-object-store";

export class R2StoryAttachmentObjectStore
  implements StoryAttachmentObjectStore
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
}
