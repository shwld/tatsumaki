const RETURN_TO_KEY = "tatsumaki:returnTo";

export class HttpStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

export function isHttpStatusError(error: unknown): error is HttpStatusError {
  return error instanceof HttpStatusError;
}

export function isAuthError(status: number): boolean {
  return status === 401;
}

export function isForbiddenError(status: number): boolean {
  return status === 403;
}

export function saveReturnTo(): void {
  const current = window.location.pathname + window.location.search;
  sessionStorage.setItem(RETURN_TO_KEY, current);
}

export function popReturnTo(): string | null {
  const value = sessionStorage.getItem(RETURN_TO_KEY);
  if (value) {
    sessionStorage.removeItem(RETURN_TO_KEY);
  }
  return value;
}
