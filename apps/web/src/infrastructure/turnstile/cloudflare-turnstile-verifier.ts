import type {
  TurnstileVerification,
  TurnstileVerifier,
} from "../../application/ports/turnstile-verifier";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

// Cloudflare invalidates a token after one Siteverify call, which is what makes it single use.
export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(
    private readonly secret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async verify(input: TurnstileVerification): Promise<boolean> {
    const body = new URLSearchParams({
      secret: this.secret,
      response: input.token,
    });
    if (input.remoteIp) {
      body.set("remoteip", input.remoteIp);
    }

    let result: SiteverifyResponse;
    try {
      const response = await this.fetcher(SITEVERIFY_URL, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        console.warn("Turnstile Siteverify request failed", {
          status: response.status,
        });
        return false;
      }
      result = (await response.json()) as SiteverifyResponse;
    } catch (error) {
      console.warn("Turnstile Siteverify request errored", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    const verified =
      result.success === true &&
      result.hostname === input.hostname &&
      result.action === input.action;
    if (!verified) {
      console.warn("Turnstile verification rejected", {
        success: result.success === true,
        errorCodes: result["error-codes"] ?? [],
        hostnameMatches: result.hostname === input.hostname,
        actionMatches: result.action === input.action,
      });
    }
    return verified;
  }
}
