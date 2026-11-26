// R2 accepts at most 1000 keys per delete call.
const R2_DELETE_LIMIT = 1000;

export async function deleteManyFromR2(
  bucket: R2Bucket,
  keys: string[],
): Promise<void> {
  for (let index = 0; index < keys.length; index += R2_DELETE_LIMIT) {
    await bucket.delete(keys.slice(index, index + R2_DELETE_LIMIT));
  }
}
