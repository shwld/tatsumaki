export type AccessJwtHeader = {
  alg?: string;
  kid?: string;
};

export type AccessJwtPayload = {
  aud?: string | string[];
  exp?: number;
  sub?: string;
  email?: string;
};

export type AccessJwk = JsonWebKey & {
  kid?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const selectJwk = (
  keys: AccessJwk[],
  kid?: string,
): AccessJwk | undefined => {
  if (kid) {
    return keys.find((key) => key.kid === kid);
  }

  if (keys.length === 1) {
    return keys[0];
  }

  return undefined;
};

export const verifyRs256Signature = async (
  data: string,
  encodedSignature: string,
  jwk: AccessJwk,
): Promise<boolean> => {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    encoder.encode(data),
  );
};

export const hasExpectedAudience = (
  audience: AccessJwtPayload["aud"],
  expectedAudience: string,
): boolean => {
  if (typeof audience === "string") {
    return audience === expectedAudience;
  }

  if (Array.isArray(audience)) {
    return audience.includes(expectedAudience);
  }

  return false;
};

export const isTokenActive = (exp?: number): boolean => {
  if (typeof exp !== "number") {
    return false;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return exp > nowInSeconds;
};

export const decodeJsonSegment = <T>(segment: string): T => {
  const json = decoder.decode(decodeBase64Url(segment));
  return JSON.parse(json) as T;
};

const decodeBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const output = new Uint8Array(new ArrayBuffer(binary.length));

  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }

  return output;
};
