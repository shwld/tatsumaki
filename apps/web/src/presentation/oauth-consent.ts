import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";

const CONSENT_TTL_MS = 600_000;

type ConsentRecord = { userId: string; search: string };

type ConsentUser = { id: string; email?: string | null };

type ConsentEnv = { DB: D1Database; OAUTH_PROVIDER: OAuthHelpers };

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

function htmlResponse(body: string, status = 200, formAction = "'self'") {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      // no-referrer makes browsers send `Origin: null` on the consent form POST,
      // which handleConsentDecision rejects.
      "referrer-policy": "same-origin",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}

function page(
  title: string,
  content: string,
  status = 200,
  formAction?: string,
) {
  return htmlResponse(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#222}h1{font-size:1.25rem}dl{background:#f5f5f5;padding:1rem;border-radius:6px}dt{font-weight:600;font-size:.85rem;color:#555}dd{margin:0 0 .75rem;word-break:break-all}.actions{display:flex;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.5rem 1.25rem;border-radius:6px;border:1px solid #888;cursor:pointer}button.approve{background:#1a56db;color:#fff;border-color:#1a56db}</style></head><body>${content}</body></html>`,
    status,
    formAction,
  );
}

// Browsers apply form-action to the redirect that follows the submission, so
// the approval's redirect to the client's callback must be allowed here.
function redirectSource(redirectUri: string) {
  const { origin, protocol } = new URL(redirectUri);
  return origin === "null" ? protocol : origin;
}

function errorPage(message: string, status = 400) {
  return page(
    "認可エラー",
    `<h1>認可リクエストを処理できません</h1><p>${escapeHtml(message)}</p>`,
    status,
  );
}

function authorizationErrorResponse(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null;
  if (!error.redirectUri) return errorPage(error.description);
  const redirect = new URL(error.redirectUri);
  redirect.searchParams.set("error", error.code);
  redirect.searchParams.set("error_description", error.description);
  if (error.state) redirect.searchParams.set("state", error.state);
  if (error.issuer) redirect.searchParams.set("iss", error.issuer);
  return Response.redirect(redirect.toString(), 302);
}

async function resolveAuthRequest(
  env: ConsentEnv,
  search: string,
  origin: string,
) {
  const request = new Request(`${origin}/oauth/authorize${search}`);
  const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  const unsupportedScope = authRequest.scope.find(
    (scope) => !Object.hasOwn(SCOPE_DESCRIPTIONS, scope),
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
    const response = authorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const { authRequest, client } = resolved;
  const scopes = authRequest.scope.length > 0 ? authRequest.scope : ["mcp"];

  const nonce = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM oauth_consent_nonces WHERE expires_at <= ?",
    ).bind(now),
    env.DB.prepare(
      "INSERT INTO oauth_consent_nonces (nonce, user_id, search, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(nonce, user.id, url.search, now + CONSENT_TTL_MS),
  ]);

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
    200,
    `'self' ${redirectSource(authRequest.redirectUri)}`,
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

  const row = await env.DB.prepare(
    "DELETE FROM oauth_consent_nonces WHERE nonce = ? AND expires_at > ? RETURNING user_id, search",
  )
    .bind(nonce, Date.now())
    .first<{ user_id: string; search: string }>();
  if (!row) {
    return errorPage(
      "承認の有効期限が切れました。最初からやり直してください。",
    );
  }

  const record: ConsentRecord = { userId: row.user_id, search: row.search };
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
    const response = authorizationErrorResponse(error);
    if (response) return response;
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
