export const ARTIFACT_CONTENT_TOKEN_TTL_SECONDS = 10 * 60;

const TOKEN_VERSION = "v1";
const TOKEN_PURPOSE = "artifact-content";
const KEY_ID_LENGTH = 8;

export type ArtifactContentClaims = {
  projectId: string;
  artifactId: string;
  version: number;
};

export type ArtifactContentSigningKeys = {
  current: string;
  /** Still accepted for verification so a key can be rotated without breaking live previews. */
  previous?: string;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  try {
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function keyId(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return Array.from(new Uint8Array(digest).slice(0, KEY_ID_LENGTH / 2))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function importHmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signArtifactContentToken(
  keys: ArtifactContentSigningKeys,
  claims: ArtifactContentClaims,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(
    now.getTime() + ARTIFACT_CONTENT_TOKEN_TTL_SECONDS * 1000,
  );
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        purpose: TOKEN_PURPOSE,
        projectId: claims.projectId,
        artifactId: claims.artifactId,
        version: claims.version,
        exp: Math.floor(expiresAt.getTime() / 1000),
      }),
    ),
  );
  const signingInput = `${TOKEN_VERSION}.${await keyId(keys.current)}.${payload}`;
  const mac = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(keys.current, "sign"),
    encoder.encode(signingInput),
  );
  return {
    token: `${signingInput}.${toBase64Url(new Uint8Array(mac))}`,
    expiresAt,
  };
}

/** Returns null for every kind of invalid token so callers cannot tell them apart. */
export async function verifyArtifactContentToken(
  keys: ArtifactContentSigningKeys,
  token: string,
  now: Date,
): Promise<ArtifactContentClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, kid, payload, mac] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (version !== TOKEN_VERSION) return null;

  const macBytes = fromBase64Url(mac);
  if (!macBytes) return null;

  let secret: string | undefined;
  for (const candidate of [keys.current, keys.previous]) {
    if (candidate && (await keyId(candidate)) === kid) {
      secret = candidate;
      break;
    }
  }
  if (!secret) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await importHmacKey(secret, "verify"),
    macBytes,
    encoder.encode(`${version}.${kid}.${payload}`),
  );
  if (!valid) return null;

  const payloadBytes = fromBase64Url(payload);
  if (!payloadBytes) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const record = claims as Record<string, unknown>;
  if (
    Object.keys(record).length !== 5 ||
    record.purpose !== TOKEN_PURPOSE ||
    typeof record.projectId !== "string" ||
    typeof record.artifactId !== "string" ||
    !Number.isInteger(record.version) ||
    (record.version as number) < 1 ||
    !Number.isInteger(record.exp) ||
    (record.exp as number) * 1000 <= now.getTime() ||
    (record.exp as number) * 1000 >
      now.getTime() + ARTIFACT_CONTENT_TOKEN_TTL_SECONDS * 1000
  ) {
    return null;
  }
  return {
    projectId: record.projectId,
    artifactId: record.artifactId,
    version: record.version as number,
  };
}
