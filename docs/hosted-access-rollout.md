# 公式ホスト版の Cloudflare Access 自由登録運用

公式ホスト版(`ENTITLEMENT_MODE=control-plane`)で、本番の Cloudflare Access を「メール OTP で誰でも通れる」状態にする手順、確認結果、ロールバック。判断の根拠は [ADR-0011](adr/adr-0011-open-registration-free-plan.md) と [ADR-0012](adr/adr-0012-artifact-content-separate-site.md)。

ローカル Tunnel の検証手順は [local-cloudflare-access-setup.md](local-cloudflare-access-setup.md) を参照する。

## 前提

次が完了してから本番ポリシーを開く。順序は ADR-0011 の Consequences に従う。

- Control Plane の free プラン(`FREE_MAX_OWNED_PROJECTS=0`)と `ENTITLEMENT_MODE=control-plane` が本番で有効
- オンボーディング・API key 発行・`/oauth/register` のレート制限(`ONBOARDING_RATE_LIMITER`、`API_KEY_RATE_LIMITER`、`OAUTH_REGISTER_RATE_LIMITER`)が本番 Worker にバインドされている
- 規約同意と Turnstile(下記)が設定済み
- `ARTIFACT_CONTENT_ORIGIN` と `ARTIFACT_APP_ORIGIN` が設定済み。未設定なら artifact の preview は無効のままになる(ADR-0012 §5)

## Access 構成

本番には次の Access application がある。setup script が作るのは本体と `artifact content` のみで、`api-key-route` と `programmatic-api` は手動で作成している。

| application | 宛先 | ポリシー | 認証 |
| --- | --- | --- | --- |
| 本体 | `<app-host>` 全体 | 自由登録ポリシー(Allow、Include: Everyone) | メール OTP のみ |
| artifact content | `<content-host>/artifact-content/*` | bypass(Everyone) | capability token |
| api-key-route | `<app-host>/api-key/*` | bypass(Everyone) | project API key |
| programmatic-api | `<app-host>/programmatic-api`、`/.well-known/oauth-authorization-server`、`/.well-known/oauth-protected-resource*`、`/oauth/token`、`/oauth/register` | bypass(Everyone) | OAuth Bearer(`/oauth/token`・`/oauth/register` は OAuth の仕様上匿名) |

`/oauth/authorize` と `/oauth/consent` は bypass に含めない。ユーザーのログインと同意が必要なため、Access の背後に残す。

### 本体 application の認証設定

- 「利用可能なすべての ID プロバイダーを受け入れる」をオフにし、**One-time PIN だけ**を選ぶ
- ポリシーは Allow、Include: Everyone。MFA 上書き・目的の正当化・一時認証はオフ
- 変更前の状態は「全 ID プロバイダーを受け入れる」オン、ポリシーは単一アカウント限定だった

自由登録ポリシーは再利用型で、複数の application に付けられる。ローカル開発用 Tunnel の application に付けると開発機が公開されるため、付けない。

## Turnstile

オンボーディングは Turnstile の検証に通った場合だけ `users` 行を作る。site key と secret の両方が無いと、公式ホスト版は登録を拒否する(`ONBOARDING_UNAVAILABLE`)。

1. Cloudflare ダッシュボードの Turnstile でウィジェットを作る。ホスト名は本番のドメイン、モードは Managed。サブドメインは登録したドメインに含まれる
2. 同じウィジェットの site key と secret を Worker に設定する。別ウィジェットの値を組み合わせると検証に失敗する

```bash
bun run wrangler secret put TURNSTILE_SITE_KEY --name <worker-name>
bun run wrangler secret put TURNSTILE_SECRET_KEY --name <worker-name>
```

3. サーバーは Siteverify の結果の `hostname` と `action` を照合する。ページのホスト名がウィジェットのホスト名配下にあること

secret の追加は即時に反映され、再 deploy は不要。deploy は `--keep-vars` で行うため、設定値は消えない。

## バイパス経路の確認

公開前と変更のたびに、未認証で次を確認する。GET と、無効な認証での POST だけで、データは変わらない。

```bash
H=https://<app-host>
for p in / /api/projects /api/onboarding /api-key /oauth/authorize /oauth/consent /invite/x /artifact-content/x; do
  printf '%-32s ' "$p"; curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$H$p"
done
for p in /programmatic-api/mcp /programmatic-api/v1/me; do
  printf '%-32s ' "$p"; curl -s -o /dev/null -X POST -H 'Authorization: Bearer invalid' -w '%{http_code}\n' "$H$p"
done
curl -s -o /dev/null -w '%{http_code}\n' "https://<content-host>/"
curl -s -o /dev/null -w '%{http_code}\n' "https://<content-host>/artifact-content/x/index.html"
```

期待する結果:

| 経路 | 期待 |
| --- | --- |
| `/`、`/api/*`、`/api-key`、`/oauth/authorize`、`/oauth/consent`、`/invite/*`、`/artifact-content/*`(本体 host) | 302 → Access ログイン |
| `/programmatic-api/*`(無効な Bearer) | 401 |
| `/oauth/token`(GET) | 405。POST は 400(`invalid_request`) |
| `/.well-known/oauth-*` | 200 |
| content host の `/` と、トークンなしの `/artifact-content/*` | 404(`sandbox` CSP、cookie なし) |

### 確認結果(2026-11-08、公式ホスト版の本番)

上の期待どおりだった。`/api-key/*` は Access を通らず Worker が応答した(project API key で認証)。content host は `/artifact-content/*` 以外が 404 で、`frame-ancestors` は本体 origin のみ、cookie は設定されなかった。

## 容量・件数の扱いと運用監視

- artifact の上限は 1 version あたり合計 50 MB、1 ファイル 25 MB、1000 ファイル。ユーザー・project 単位の総量上限は無い(ADR-0010 は quota を out of scope としている)
- free ユーザーは project を作れず、artifact を置けるのは招待された project だけ。この前提で、総量上限は公開の条件にしない
- R2 の使用量(`<prefix>-artifacts`、`<prefix>-story-attachments`)と D1 のサイズを、Cloudflare ダッシュボードで定期的に確認する。異常な増加があれば、増加元のユーザーを特定して停止する
- ユーザーの停止は `access_status` を `blocked` にする。`blocked` は Access 通過後のすべての API と `/api-key` で拒否される

```bash
bun run wrangler d1 execute <prefix>-db --remote \
  --command "UPDATE users SET access_status = 'blocked' WHERE email = '<email>'"
```

## ロールバック

公開を止める手順を、影響の小さい順に示す。

1. **登録だけ止める**: Worker の `TURNSTILE_SECRET_KEY` を削除する。公式ホスト版は fail-closed になり、新規登録が拒否される。既存ユーザーには影響しない
2. **Access を元に戻す**: 本体 application の自由登録ポリシーを無効にし、元の単一アカウント限定ポリシーだけを有効にする。本体 application の ID プロバイダーは、元の設定(全 ID プロバイダーを受け入れる)に戻す
3. **特定ユーザーを止める**: 上記の `blocked` を使う

元のポリシーは削除せず残しておく。bypass application は自由登録の前後で同じなので、戻す必要はない。
