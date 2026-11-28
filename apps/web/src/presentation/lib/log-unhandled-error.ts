import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

// 例外の message は SQL の引数(メールアドレスやトークンのハッシュ)を含むため、保存されるログに出さない。
export const logUnhandledError: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error({
    event: "http.unhandled_error",
    method: c.req.method,
    route: c.req.routePath,
    errorType: error.constructor.name,
    stack: error.stack?.replace(error.message, ""),
  });
  return c.text("Internal Server Error", 500);
};
