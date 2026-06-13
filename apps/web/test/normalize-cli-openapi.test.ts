import { describe, expect, it } from "vitest";
import { normalizeCliOpenApiDoc } from "../src/presentation/openapi/normalize-cli-openapi";

describe("normalizeCliOpenApiDoc", () => {
  it("normalizes nested nullable types for OpenAPI 3.0.3", () => {
    const doc = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
      paths: {
        "/stories": {
          patch: {
            storyPoint: {
              type: ["integer", "null"],
            },
          },
        },
      },
    };

    expect(normalizeCliOpenApiDoc(doc)).toEqual({
      openapi: "3.0.3",
      paths: {
        "/stories": {
          patch: {
            storyPoint: {
              type: "integer",
              nullable: true,
            },
          },
        },
      },
    });
  });

  it("preserves non-nullable types", () => {
    const doc = {
      openapi: "3.1.0",
      paths: {
        "/stories": {
          get: {
            title: {
              type: "string",
            },
          },
        },
      },
    };

    expect(normalizeCliOpenApiDoc(doc)).toEqual({
      openapi: "3.0.3",
      paths: {
        "/stories": {
          get: {
            title: {
              type: "string",
            },
          },
        },
      },
    });
  });
});
