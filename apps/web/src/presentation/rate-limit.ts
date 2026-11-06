// An unbound limiter means the deployment opted out (self-hosted default).
export async function isRateLimited(
  limiter: RateLimit | undefined,
  keys: string[],
): Promise<boolean> {
  if (!limiter) return false;
  for (const key of keys) {
    const { success } = await limiter.limit({ key });
    if (!success) return true;
  }
  return false;
}
