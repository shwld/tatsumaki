export function normalizeCliOpenApiDoc(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  // progenitor consumes OpenAPI 3.0.x. Normalize the root metadata and nullable
  // types currently emitted by the CLI schema generator.
  doc.openapi = "3.0.3";
  delete doc.jsonSchemaDialect;
  normalizeNullableTypes(doc);
  return doc;
}

function normalizeNullableTypes(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) normalizeNullableTypes(item);
    return;
  }
  if (!value || typeof value !== "object") return;

  const object = value as Record<string, unknown>;
  if (Array.isArray(object.type) && object.type.includes("null")) {
    const nonNullTypes = object.type.filter((type) => type !== "null");
    if (nonNullTypes.length === 1) {
      object.type = nonNullTypes[0];
      object.nullable = true;
    }
  }
  for (const child of Object.values(object)) normalizeNullableTypes(child);
}
