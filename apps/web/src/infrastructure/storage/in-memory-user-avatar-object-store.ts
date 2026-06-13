import type {
  StoredUserAvatarObject,
  UserAvatarObjectStore,
} from "../../application/ports/user-avatar-object-store";

export class InMemoryUserAvatarObjectStore implements UserAvatarObjectStore {
  private readonly objects = new Map<
    string,
    { data: Uint8Array; contentType: string }
  >();

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string },
  ): Promise<void> {
    const buffer = await new Response(body).arrayBuffer();
    this.objects.set(key, {
      data: new Uint8Array(buffer),
      contentType: options.contentType,
    });
  }

  async get(key: string): Promise<StoredUserAvatarObject | null> {
    const entry = this.objects.get(key);
    if (!entry) {
      return null;
    }

    const { data, contentType } = entry;
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }),
      contentType,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
