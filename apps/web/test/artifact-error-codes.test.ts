import { describe, expect, it } from "vitest";
import errorCodes from "./fixtures/artifact-error-codes.json";
import { STATUS_BY_CODE } from "../src/presentation/routes/artifacts/responses";

describe("artifact error codes", () => {
  it("matches the table the CLI maps to exit codes", () => {
    expect(STATUS_BY_CODE).toEqual(errorCodes.statusByCode);
  });
});
