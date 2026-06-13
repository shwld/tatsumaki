const TEST_KEY_ID = "test-access-key";

const encoder = new TextEncoder();

type JwtOverrides = {
  aud?: string | string[];
  exp?: number;
  sub?: string;
  email?: string;
};

type SignerState = {
  privateKey: CryptoKey;
};
type AccessJwk = JsonWebKey & { kid?: string };

let signerPromise: Promise<SignerState> | null = null;

export const TEST_ACCESS_AUD = "test-access-audience";
const TEST_PRIVATE_JWK: AccessJwk = {
  kty: "RSA",
  n: "puuPKyVCxnuIEolWMa6tTQCX-MdNi7QAdt7DhB_XOpL9vPD9gZK-3JUhVGHmCvrBFJoaBeu72i5CIQ5uFZi2xkx0_m1Wuzd0Cx3ALWIr1gv3w_n1qEAy88LRa2olF7BB74U5dFvdFZc0i1E40xZc5srcFP2QTsqwwRLX-vNjOgLJ15m_xKlXgNSgzDeIA7YZBMPBnkLbpvkMO8JI3dqzQX3mh1cS41GCQFqM9Wi66fVs-6imzMSLdvfbr3BFbn73NT6R1iaq74fHu-y3JLdk42VLymZxHT7cQMLCoyz9mi61jc0lYpOOh8MomQlFwWwBQOb9SkiwPH-mh4M8JI5cNQ",
  e: "AQAB",
  d: "GxyOR9Ro1ig2X8cNcvW2PELpFtqi-Rqm1f00sH8jduYXxIU4B8Bis8fyfpbaxdRuC_9DqXaH2oDs83A5PSoYIHlGqhSZo8BMCYou2VrlV9eLH2UNcOM3OL80mJ0doo1Zsve770RZ0n9ED4-FCp7KlB9FmTszdzjAy3tYt-_-9pWTHw1CEhLeVgwcOijj9mNSzBkDpxD0hIg2WsYGOtpWPf08HLiE_g4wYEnKzKYt2o0gpT2o9Ze57T3ACxNvovIzmFnDk6ossbCKuHj_iRpqB7XmzEIvbCfe07VdejAlghUzoLa_DN2_dzYs1ve_DufLjaVLglDDxFAX26oWuLXCuQ",
  p: "5zgWfyhBT2npBxHurwZiGjz5tVAtMRBT5TNw7vlaw6soh3Sef4GU_pM9NDCE2Gnnpr_SUIZeOKh3Rt6CxObFU-hTeKGUJuOTkmcQ9vK6_Fk80P49ggfHDqtdqHQMsdiUsgHyEdUnI4To78ryJf83bZozDdjGcZ7XynY1_c42cP8",
  q: "uM9QbsERRE3COoROcLIePWtlLIurR-rRNL_GaqBD8iUKVYzxIZjo6mN8mukylDmpO_jDejDmHlrxlWO0_AH3FGJrBy6Q3y6SWUDS5nrTTev6Pn5HmMkisSKPvN3IjeMcFMB3oQFnT791QquCSdiE1-KlaeW1uYwqv98KElr7Pss",
  dp: "KmPHBBLuPk_tb-Viu-XQsHzDTvFfB6K1rsyKhNVkRYEokgTYVgn8tdtqmhnXERIBbTm3phmsRnjkPTLoCI9CWAq82t3MmoCYenu4yX1guIjntG0X-7HPVaonJo34EdbiE-x1Y72PSlzAk83CLSMoF0jw2TYH06bKawzXAyv-ISM",
  dq: "SHsOWZGg2wAAKAER3oMM9xuyn2jbsSX4DM8V22WloEdEqU7Ql1OoLZz9FqhU7Os8Y0fqKncZGVijnOpw5dFDfRwoS7XIna9fOGADFt-fFdVx3KacH-DqmTwr0W_OI0-qCL1_bYbmZNF7BL3NKHchiqXaKBEuV2oQrhWklpRWK0c",
  qi: "Azj6L4uJOUU56allsSUFGpi7nOaPpb0uLnh41pGmP6W5vqXDdNHhlMp1tfQPXHb36q9dc1bf7aNdoZTg7hm0fUb3zhyuFtWeCt-0QEj-72BvISY9ELCpCGncfxOpXIZm1nejaYhUocEhkSwuyqPhubQXMMfIAGYewOD_TXGFmgY",
  alg: "RS256",
  kid: TEST_KEY_ID,
  use: "sig",
  key_ops: ["sign"],
  ext: true,
};
const TEST_JWKS_JSON =
  '{"keys":[{"key_ops":["verify"],"ext":true,"kty":"RSA","n":"puuPKyVCxnuIEolWMa6tTQCX-MdNi7QAdt7DhB_XOpL9vPD9gZK-3JUhVGHmCvrBFJoaBeu72i5CIQ5uFZi2xkx0_m1Wuzd0Cx3ALWIr1gv3w_n1qEAy88LRa2olF7BB74U5dFvdFZc0i1E40xZc5srcFP2QTsqwwRLX-vNjOgLJ15m_xKlXgNSgzDeIA7YZBMPBnkLbpvkMO8JI3dqzQX3mh1cS41GCQFqM9Wi66fVs-6imzMSLdvfbr3BFbn73NT6R1iaq74fHu-y3JLdk42VLymZxHT7cQMLCoyz9mi61jc0lYpOOh8MomQlFwWwBQOb9SkiwPH-mh4M8JI5cNQ","e":"AQAB","alg":"RS256","kid":"test-access-key","use":"sig"}]}';

export const setupAccessBindings = async (env: {
  ACCESS_AUD?: string;
  ACCESS_JWKS_JSON?: string;
  ACCESS_TEAM_DOMAIN?: string;
}) => {
  env.ACCESS_AUD = TEST_ACCESS_AUD;
  env.ACCESS_JWKS_JSON = TEST_JWKS_JSON;
  env.ACCESS_TEAM_DOMAIN = "test-team.cloudflareaccess.com";
};

export const createAccessJwt = async (overrides: JwtOverrides = {}) => {
  const signer = await getSigner();

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: TEST_KEY_ID,
  };

  const payload = {
    aud: [TEST_ACCESS_AUD],
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: "github|test-user",
    email: "tester@example.com",
    ...overrides,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signer.privateKey,
    encoder.encode(signingInput),
  );

  const encodedSignature = encodeBase64Url(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
};

export const createAuthHeaders = async (overrides: JwtOverrides = {}) => {
  return {
    "Cf-Access-Jwt-Assertion": await createAccessJwt(overrides),
  };
};

const getSigner = async (): Promise<SignerState> => {
  if (!signerPromise) {
    signerPromise = createSigner();
  }

  return signerPromise;
};

const createSigner = async (): Promise<SignerState> => {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    TEST_PRIVATE_JWK,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["sign"],
  );

  return {
    privateKey,
  };
};

const encodeBase64Url = (input: string | Uint8Array) => {
  const bytes =
    typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);

  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};
