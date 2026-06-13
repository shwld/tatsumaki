import { afterEach, describe, expect, it } from "vitest";
import {
  isAuthError,
  isForbiddenError,
  popReturnTo,
  saveReturnTo,
} from "./api-error";

describe("isAuthError", () => {
  it("returns true for 401", () => {
    expect(isAuthError(401)).toBe(true);
  });

  it("returns false for other status codes", () => {
    expect(isAuthError(200)).toBe(false);
    expect(isAuthError(403)).toBe(false);
    expect(isAuthError(500)).toBe(false);
  });
});

describe("isForbiddenError", () => {
  it("returns true for 403", () => {
    expect(isForbiddenError(403)).toBe(true);
  });

  it("returns false for other status codes", () => {
    expect(isForbiddenError(200)).toBe(false);
    expect(isForbiddenError(401)).toBe(false);
  });
});

describe("saveReturnTo / popReturnTo", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("saves and pops the current path", () => {
    // jsdom defaults location to about:blank, so pathname is "/"
    saveReturnTo();
    const value = popReturnTo();
    expect(typeof value).toBe("string");
  });

  it("returns null after pop", () => {
    saveReturnTo();
    popReturnTo();
    expect(popReturnTo()).toBeNull();
  });
});
