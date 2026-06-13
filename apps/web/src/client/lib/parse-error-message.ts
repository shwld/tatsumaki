import type { FieldErrors } from "../types/form";

export async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      return data.error;
    }
  } catch {
    // Ignore parse failures and fallback to status-based message.
  }

  return "Unexpected error";
}

export async function parseFieldErrors(
  response: Response,
): Promise<{ fieldErrors: FieldErrors; formError: string | null }> {
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      if (
        "fieldErrors" in data &&
        data.fieldErrors &&
        typeof data.fieldErrors === "object"
      ) {
        const fieldErrors: FieldErrors = {};
        for (const [key, value] of Object.entries(
          data.fieldErrors as Record<string, unknown>,
        )) {
          if (typeof value === "string") {
            fieldErrors[key] = value;
          }
        }
        if (Object.keys(fieldErrors).length > 0) {
          return { fieldErrors, formError: null };
        }
      }

      if ("error" in data && typeof data.error === "string") {
        return { fieldErrors: {}, formError: data.error };
      }
    }
  } catch {
    // Ignore parse failures and fallback.
  }

  return { fieldErrors: {}, formError: "Unexpected error" };
}
