import { z } from "zod";

/** Every destination received from the provider must be https (ADR-0016). */
export const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");
