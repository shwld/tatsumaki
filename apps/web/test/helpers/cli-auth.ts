import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { createAuthHeaders } from "./access-jwt";

/** Runs the OAuth authorization-code flow and returns a CLI access token. */
export async function issueAccessToken(
  identity?: Parameters<typeof createAuthHeaders>[0],
) {
  const response = await SELF.fetch("https://localhost/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "tm",
      redirect_uris: ["https://tm.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    }),
  });
  expect(response.status).toBe(201);
  const { client_id } = (await response.json()) as { client_id?: string };
  expect(client_id).toBeTruthy();

  const verifier = "test-verifier-cli-v1";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const authorizeUrl = new URL("https://localhost/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", client_id ?? "");
  authorizeUrl.searchParams.set("redirect_uri", "https://tm.example/callback");
  authorizeUrl.searchParams.set("scope", "mcp");
  authorizeUrl.searchParams.set("state", "state-cli-v1");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set(
    "resource",
    "https://localhost/programmatic-api/v1",
  );

  const authorizeResponse = await SELF.fetch(authorizeUrl, {
    headers: await createAuthHeaders(identity),
    redirect: "manual",
  });
  expect(authorizeResponse.status).toBe(302);
  const redirectUrl = new URL(authorizeResponse.headers.get("location") ?? "");
  const code = redirectUrl.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await SELF.fetch("https://localhost/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client_id ?? "",
      code: code ?? "",
      redirect_uri: "https://tm.example/callback",
      code_verifier: verifier,
    }).toString(),
  });
  expect(tokenResponse.status).toBe(200);
  const { access_token } = (await tokenResponse.json()) as {
    access_token?: string;
  };
  expect(access_token).toBeTruthy();
  return access_token ?? "";
}
