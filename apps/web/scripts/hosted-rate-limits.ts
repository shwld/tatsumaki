// namespace_id is account-wide: Workers sharing an ID share counters, so each
// hosted Worker gets its own IDs derived from its name.
function namespaceId(workerName: string, binding: string): string {
  let hash = 0x811c9dc5;
  for (const char of `${workerName}:${binding}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return String(hash || 1);
}

const LIMITS = [
  { name: "ONBOARDING_RATE_LIMITER", limit: 5, period: 60 },
  { name: "API_KEY_RATE_LIMITER", limit: 10, period: 60 },
  { name: "OAUTH_REGISTER_RATE_LIMITER", limit: 10, period: 60 },
];

export function hostedRateLimits(workerName: string) {
  return LIMITS.map(({ name, limit, period }) => ({
    name,
    namespace_id: namespaceId(workerName, name),
    simple: { limit, period },
  }));
}
