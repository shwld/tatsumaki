import { z } from "zod";
import { httpsUrlSchema } from "./https-url";

const sessionSchema = z.object({ url: httpsUrlSchema });

export const parseSessionResponse = (response: unknown): { url: string } =>
  sessionSchema.parse(response);
