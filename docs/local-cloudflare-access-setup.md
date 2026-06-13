# ローカル開発でCloudflare Accessログインを検証する

ローカルの開発サーバー（`wrangler dev` on `localhost:8787`）を **Cloudflare Tunnel** 経由で公開し、
Cloudflare Access 保護下のドメインでログインフローを検証する手順。

> **ローカル開発専用の手順です。CI・本番環境には影響しません。**

---

## 前提条件

| 項目 | 詳細 |
|------|------|
| `cloudflared` CLI | `brew install cloudflared` でインストール |
| Cloudflare アカウント | Zero Trust ダッシュボードへのアクセス権 |
| Cloudflare に登録済みのドメイン | Tunnel の公開ホスト名に使用 |
| `bun` | アプリのローカル起動に必要 |

---

## 初期セットアップ（初回のみ）

### 1. cloudflared にログイン

```bash
cloudflared tunnel login
```

ブラウザが開き、Cloudflare アカウントを選択して認証する。
`~/.cloudflared/cert.pem` が保存される。

### 2. Named Tunnel を作成

```bash
cloudflared tunnel create tatsumaki-local
```

出力される Tunnel ID（UUID）を控える。
`~/.cloudflared/<TUNNEL_ID>.json` にクレデンシャルが保存される。

### 3. DNS レコードを設定

```bash
cloudflared tunnel route dns tatsumaki-local <hostname>
```

例: `cloudflared tunnel route dns tatsumaki-local local-dev.example.com`

これにより `<hostname>` に CNAME レコードが作成され、Tunnel 経由でルーティングされる。

### 4. Tunnel 設定ファイルを作成

`~/.cloudflared/config.yml` を作成（または追記）:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<username>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <hostname>
    service: http://localhost:8787
  - service: http_status:404
```

### 5. Cloudflare Access Application を設定

[Cloudflare Zero Trust ダッシュボード](https://one.dash.cloudflare.com/) で:

1. **Access → Applications → Add an application**
2. **Self-hosted** を選択
3. **Application domain** にステップ 3 で設定した `<hostname>` を入力
4. **Policy** でログインを許可するユーザー/グループを設定（例: GitHub IdP でメールアドレス一致）
5. 作成後、Application の **Audience (AUD) tag** を控える

---

## 起動方法

ターミナルを 2 つ開く:

**ターミナル 1: アプリ起動**

```bash
bun run dev
```

`wrangler dev` が `localhost:8787` で起動する。

**ターミナル 2: Tunnel 起動**

```bash
cloudflared tunnel run tatsumaki-local
```

### wrangler dev の環境変数

`wrangler dev` 実行時に Access 検証用の環境変数を渡す:

```bash
# .dev.vars ファイルに記載する（.gitignore 済み）
ACCESS_AUD=<Application の AUD tag>
ACCESS_TEAM_DOMAIN=<your-team>.cloudflareaccess.com
```

> `apps/web/.dev.vars` は wrangler が自動で読み込む。秘密情報のため Git にコミットしない。

---

## 検証手順

1. ブラウザで `https://<hostname>` にアクセス
2. Cloudflare Access のログイン画面が表示される
3. IdP（GitHub 等）で認証する
4. アプリのトップ画面に遷移する
5. `https://<hostname>/api/auth/me` にアクセスし、`{"email":"your@email.com"}` が返ることを確認

---

## トラブルシュート

### Access ログイン後に 403 が返る

- **AUD 不一致**: `.dev.vars` の `ACCESS_AUD` が Access Application の Audience tag と一致しているか確認
- **TEAM_DOMAIN 不一致**: `ACCESS_TEAM_DOMAIN` が Zero Trust ダッシュボードのチーム名と一致しているか確認

### JWT 検証エラー

- **トークン期限切れ**: ブラウザの Cookie をクリアして再ログイン
- **JWKS 取得失敗**: `cloudflared` が正常に動作しているか確認。`cloudflared tunnel info tatsumaki-local` で状態を確認

### Tunnel に接続できない

- `cloudflared tunnel run` が起動しているか確認
- `~/.cloudflared/config.yml` の `hostname` と DNS 設定が一致しているか確認
- `localhost:8787` でアプリが起動しているか確認

### Cookie / ドメイン問題

- Cloudflare Access の JWT は Access が管理するドメインの Cookie に設定される
- ローカルの `localhost` では Cookie が設定されないため、必ず Tunnel 経由のホスト名でアクセスする

---

## 注意事項

- **この手順はローカル開発環境専用です。** CI/CD パイプラインや本番デプロイには影響しません
- `cloudflared` の設定ファイル（`~/.cloudflared/`）はローカルマシンにのみ存在します
- `.dev.vars` は `.gitignore` に含まれているため、リポジトリにコミットされません
- Named Tunnel のクレデンシャルは個人の Cloudflare アカウントに紐づきます
