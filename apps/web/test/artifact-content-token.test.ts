import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CONTENT_TOKEN_TTL_SECONDS,
  signArtifactContentToken,
  verifyArtifactContentToken,
} from "../src/application/services/artifact-content-token";

const KEYS = { current: "current-secret" };
const CLAIMS = {
  projectId: "01HZZZZZZZZZZZZZZZZZZZZZZA",
  artifactId: "01HZZZZZZZZZZZZZZZZZZZZZZB",
  version: 3,
};
const NOW = new Date("2026-10-24T00:00:00Z");

describe("artifact content token", () => {
  it("round-trips the claims", async () => {
    const { token, expiresAt } = await signArtifactContentToken(
      KEYS,
      CLAIMS,
      NOW,
    );
    expect(expiresAt.getTime() - NOW.getTime()).toBe(
      ARTIFACT_CONTENT_TOKEN_TTL_SECONDS * 1000,
    );
    expect(token.split(".")).toHaveLength(4);
    expect(await verifyArtifactContentToken(KEYS, token, NOW)).toEqual(CLAIMS);
  });

  it("rejects an expired token at and after its expiry", async () => {
    const { token, expiresAt } = await signArtifactContentToken(
      KEYS,
      CLAIMS,
      NOW,
    );
    const justBefore = new Date(expiresAt.getTime() - 1000);
    expect(await verifyArtifactContentToken(KEYS, token, justBefore)).not.toBe(
      null,
    );
    expect(await verifyArtifactContentToken(KEYS, token, expiresAt)).toBe(null);
  });

  it("rejects a token signed with another key", async () => {
    const { token } = await signArtifactContentToken(
      { current: "other-secret" },
      CLAIMS,
      NOW,
    );
    expect(await verifyArtifactContentToken(KEYS, token, NOW)).toBe(null);
  });

  it("rejects a tampered payload or mac", async () => {
    const { token } = await signArtifactContentToken(KEYS, CLAIMS, NOW);
    const [version, kid, payload, mac] = token.split(".") as [
      string,
      string,
      string,
      string,
    ];
    const forgedPayload = btoa(
      JSON.stringify({
        purpose: "artifact-content",
        ...CLAIMS,
        version: 4,
        exp: Math.floor(NOW.getTime() / 1000) + 600,
      }),
    ).replace(/=+$/, "");
    for (const forged of [
      `${version}.${kid}.${forgedPayload}.${mac}`,
      `${version}.${kid}.${payload}.${mac.slice(0, -2)}AA`,
      `v2.${kid}.${payload}.${mac}`,
      `${version}.deadbeef.${payload}.${mac}`,
      `${version}.${kid}.${payload}`,
      `${token}.extra`,
      "",
      "not-a-token",
    ]) {
      expect(await verifyArtifactContentToken(KEYS, forged, NOW)).toBe(null);
    }
  });

  it("accepts tokens from the previous key only while it is configured", async () => {
    const { token } = await signArtifactContentToken(
      { current: "old-secret" },
      CLAIMS,
      NOW,
    );
    const rotated = { current: "new-secret", previous: "old-secret" };
    expect(await verifyArtifactContentToken(rotated, token, NOW)).toEqual(
      CLAIMS,
    );
    expect(
      await verifyArtifactContentToken({ current: "new-secret" }, token, NOW),
    ).toBe(null);
  });

  it("signs new tokens with the current key after rotation", async () => {
    const rotated = { current: "new-secret", previous: "old-secret" };
    const { token } = await signArtifactContentToken(rotated, CLAIMS, NOW);
    expect(
      await verifyArtifactContentToken({ current: "new-secret" }, token, NOW),
    ).toEqual(CLAIMS);
  });
});
