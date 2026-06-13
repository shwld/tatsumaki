export type StoredStoryAttachmentObject = {
  body: ReadableStream<Uint8Array>;
  httpEtag?: string;
};

export interface StoryAttachmentObjectStore {
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: { contentType: string },
  ): Promise<void>;

  get(key: string): Promise<StoredStoryAttachmentObject | null>;

  delete(key: string): Promise<void>;
}
