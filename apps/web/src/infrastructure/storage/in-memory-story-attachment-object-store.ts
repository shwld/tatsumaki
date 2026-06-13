import type {
  StoredStoryAttachmentObject,
  StoryAttachmentObjectStore,
} from "../../application/ports/story-attachment-object-store";

export class InMemoryStoryAttachmentObjectStore
  implements StoryAttachmentObjectStore
{
  private readonly objects = new Map<string, Uint8Array>();

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    _options: { contentType: string },
  ): Promise<void> {
    const buffer = await new Response(body).arrayBuffer();
    this.objects.set(key, new Uint8Array(buffer));
  }

  async get(key: string): Promise<StoredStoryAttachmentObject | null> {
    const value = this.objects.get(key);
    if (!value) {
      return null;
    }

    return {
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
}
