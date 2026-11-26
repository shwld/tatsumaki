export type ListedObject = {
  /** The key as the owning D1 row records it. */
  key: string;
  uploadedAt: Date;
};

export interface SweepableObjectStore {
  /** Lists the store's own objects in key order, after `startAfter`. */
  listAfter(options: {
    startAfter: string | null;
    limit: number;
  }): Promise<{ objects: ListedObject[]; truncated: boolean }>;

  deleteMany(keys: string[]): Promise<void>;
}
