import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

const CONSENT_TTL_SECONDS = 600;
const CONSENT_KEY_PREFIX = "oauth-consent:";

type ConsentRecord = { userId: string; search: string };

type ConsentUser = { id: string; email?: string | null };

type ConsentEnv = { OAUTH_KV: KVNamespace; OAUTH_PROVIDER: OAuthHelpers };

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  mcp: "tatsumaki のプロジェクト・ストーリーの閲覧と操作（あなたの権限の範囲内）",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}

function page(title: string, content: string, status = 200) {
  return htmlResponse(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#222}h1{font-size:1.25rem}dl{background:#f5f5f5;padding:1rem;border-radius:6px}dt{font-weight:600;font-size:.85rem;color:#555}dd{margin:0 0 .75rem;word-break:break-all}.actions{display:flex;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.5rem 1.25rem;border-radius:6px;border:1px solid #888;cursor:pointer}button.approve{background:#1a56db;color:#fff;border-color:#1a56db}</style></head><body>${content}</body></html>`,
    status,
  );
}

function errorPage(message: string, status = 400) {
  return page(
    "認可エラー",
    `<h1>認可リクエストを処理できません</h1><p>${escapeHtml(message)}</p>`,
    status,
  );
}

function describeAuthorizationError(error: unknown) {
  return error instanceof AuthorizationError ? error.description : null;
}

async function resolveAuthRequest(
  env: ConsentEnv,
  search: string,
  origin: string,
) {
  const request = new Request(`${origin}/oauth/authorize${search}`);
  const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  const unsupportedScope = authRequest.scope.find(
    (scope) => !(scope in SCOPE_DESCRIPTIONS),
  );
  if (unsupportedScope) {
    throw new AuthorizationError("invalid_scope", {
      description: `Unsupported scope: ${unsupportedScope}`,
      redirectUri: authRequest.redirectUri,
      state: authRequest.state,
      issuer: authRequest.issuer,
    });
  }
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  return { authRequest, client };
}

export async function renderConsentPage(
  request: Request,
  env: ConsentEnv,
  user: ConsentUser,
): Promise<Response> {
  const url = new URL(request.url);
  let resolved: Awaited<ReturnType<typeof resolveAuthRequest>>;
  try {
    resolved = await resolveAuthRequest(env, url.search, url.origin);
  } catch (error) {
    const description = describeAuthorizationError(error);
    if (description) return errorPage(description);
    throw error;
  }
  const { authRequest, client } = resolved;
  const scopes = authRequest.scope.length > 0 ? authRequest.scope : ["mcp"];

  const nonce = crypto.randomUUID();
  const record: ConsentRecord = { userId: user.id, search: url.search };
  await env.OAUTH_KV.put(CONSENT_KEY_PREFIX + nonce, JSON.stringify(record), {
    expirationTtl: CONSENT_TTL_SECONDS,
  });

  const scopeItems = scopes
    .map(
      (scope) =>
        `<li><code>${escapeHtml(scope)}</code> — ${escapeHtml(SCOPE_DESCRIPTIONS[scope] ?? "")}</li>`,
    )
    .join("");

  return page(
    "アクセスの承認",
    `<h1>アプリケーションのアクセスを承認しますか？</h1>
<dl>
<dt>アプリケーション</dt><dd>${escapeHtml(client?.clientName ?? authRequest.clientId)}</dd>
<dt>クライアント ID</dt><dd>${escapeHtml(authRequest.clientId)}</dd>
<dt>リダイレクト先</dt><dd>${escapeHtml(authRequest.redirectUri)}</dd>
<dt>サインイン中のアカウント</dt><dd>${escapeHtml(user.email ?? user.id)}</dd>
</dl>
<p>このアプリケーションは次の権限を要求しています:</p>
<ul>${scopeItems}</ul>
<p>心当たりがない場合は「拒否」を選んでください。</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="nonce" value="${escapeHtml(nonce)}">
<div class="actions">
<button type="submit" name="decision" value="deny">拒否</button>
<button type="submit" name="decision" value="approve" class="approve">承認</button>
</div>
</form>`,
  );
}

function deniedRedirect(authRequest: AuthRequest) {
  const redirect = new URL(authRequest.redirectUri);
  redirect.searchParams.set("error", "access_denied");
  redirect.searchParams.set("error_description", "The user denied the request");
  if (authRequest.state) redirect.searchParams.set("state", authRequest.state);
  if (authRequest.issuer) redirect.searchParams.set("iss", authRequest.issuer);
  return redirect.toString();
}

export async function handleConsentDecision(
  request: Request,
  env: ConsentEnv,
  user: ConsentUser,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) {
    return errorPage("不正なリクエストです。", 403);
  }

  const form = await request.formData();
  const nonce = form.get("nonce");
  const decision = form.get("decision");
  if (
    typeof nonce !== "string" ||
    (decision !== "approve" && decision !== "deny")
  ) {
    return errorPage("不正なリクエストです。");
  }

  const key = CONSENT_KEY_PREFIX + nonce;
  const stored = await env.OAUTH_KV.get(key);
  if (!stored) {
    return errorPage(
      "承認の有効期限が切れました。最初からやり直してください。",
    );
  }
  await env.OAUTH_KV.delete(key);

  const record = JSON.parse(stored) as ConsentRecord;
  if (record.userId !== user.id) {
    return errorPage("不正なリクエストです。", 403);
  }

  let authRequest: AuthRequest;
  try {
    ({ authRequest } = await resolveAuthRequest(
      env,
      record.search,
      url.origin,
    ));
  } catch (error) {
    const description = describeAuthorizationError(error);
    if (description) return errorPage(description);
    throw error;
  }

  if (decision === "deny") {
    return Response.redirect(deniedRedirect(authRequest), 302);
  }

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: user.id,
    metadata: { email: user.email ?? null },
    scope: authRequest.scope.length > 0 ? authRequest.scope : ["mcp"],
    props: {
      id: user.id,
      ...(user.email ? { email: user.email } : {}),
    },
  });
  return Response.redirect(redirectTo, 302);
}
