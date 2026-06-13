import { describe, expect, it } from "vitest";
import { parseErrorMessage, parseFieldErrors } from "./parse-error-message";

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(text: string, status = 500): Response {
  return new Response(text, { status });
}

describe("parseErrorMessage", () => {
  it("extracts error string from JSON body", async () => {
    const res = jsonResponse({ error: "Not found" });
    expect(await parseErrorMessage(res)).toBe("Not found");
  });

  it("returns fallback for non-object body", async () => {
    const res = jsonResponse("just a string");
    expect(await parseErrorMessage(res)).toBe("Unexpected error");
  });

  it("returns fallback for non-JSON body", async () => {
    const res = textResponse("<html>error</html>");
    expect(await parseErrorMessage(res)).toBe("Unexpected error");
  });

  it("returns fallback when error field is not a string", async () => {
    const res = jsonResponse({ error: 123 });
    expect(await parseErrorMessage(res)).toBe("Unexpected error");
  });
});

describe("parseFieldErrors", () => {
  it("extracts field errors from response", async () => {
    const res = jsonResponse({
      fieldErrors: { name: "is required", email: "is invalid" },
    });
    const result = await parseFieldErrors(res);
    expect(result.fieldErrors).toEqual({
      name: "is required",
      email: "is invalid",
    });
    expect(result.formError).toBeNull();
  });

  it("extracts form-level error when no field errors", async () => {
    const res = jsonResponse({ error: "Something went wrong" });
    const result = await parseFieldErrors(res);
    expect(result.fieldErrors).toEqual({});
    expect(result.formError).toBe("Something went wrong");
  });

  it("returns fallback for non-JSON body", async () => {
    const res = textResponse("bad");
    const result = await parseFieldErrors(res);
    expect(result.fieldErrors).toEqual({});
    expect(result.formError).toBe("Unexpected error");
  });

  it("ignores non-string field error values", async () => {
    const res = jsonResponse({ fieldErrors: { count: 42 } });
    const result = await parseFieldErrors(res);
    expect(result.fieldErrors).toEqual({});
    expect(result.formError).toBe("Unexpected error");
  });
});
