import type { MiddlewareHandler } from "hono";
import type { Env } from "../../index";

const JWT_HEADER_NAME = "Cf-Access-Jwt-Assertion";

const TEST_KEY_ID = "test-access-key";

const TEST_PRIVATE_JWK: JsonWebKey & { kid?: string } = {
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

let signingKeyPromise: Promise<CryptoKey> | null = null;

const getSigningKey = (): Promise<CryptoKey> => {
  if (!signingKeyPromise) {
    signingKeyPromise = crypto.subtle.importKey(
      "jwk",
      TEST_PRIVATE_JWK,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return signingKeyPromise;
};

const encoder = new TextEncoder();

const encodeBase64Url = (input: string | Uint8Array): string => {
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

const createDevJwt = async (
  email: string,
  audience: string,
): Promise<string> => {
  const key = await getSigningKey();

  const header = { alg: "RS256", typ: "JWT", kid: TEST_KEY_ID };
  const payload = {
    aud: [audience],
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: "dev|local",
    email,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
};

export const devAuth = (): MiddlewareHandler<Env> => {
  return async (c, next) => {
    const devEmail = c.env.DEV_AUTH_EMAIL;
    if (!devEmail) {
      return next();
    }

    if (c.req.header(JWT_HEADER_NAME)) {
      return next();
    }

    const audience = c.env.ACCESS_AUD;
    if (!audience) {
      return next();
    }

    const jwt = await createDevJwt(devEmail, audience);
    const headers = new Headers(c.req.raw.headers);
    headers.set(JWT_HEADER_NAME, jwt);
    c.req.raw = new Request(c.req.raw, { headers });

    return next();
  };
};
