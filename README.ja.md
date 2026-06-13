# tatsumaki

[English README](README.md)

tatsumaki is an agile project management tool for small Scrum teams that want a fast, story-centered workflow with point estimation, velocity tracking, and backlog forecasting.

The project is inspired by the workflow strengths of Pivotal Tracker, while being built as self-hostable open source software for modern web, CLI, and automation workflows.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shwld/tatsumaki/tree/main/apps/web)

![Story panels screenshot](apps/web/test/ui-screenshot/stories.spec.ts-snapshots/stories-panels.png)

## 特徴

- ユーザーストーリー・タスクの管理（作成・優先順位付け・ステータス移動）
- PivotalTracker式のスプリント管理とベロシティ追跡
- ベロシティに基づく残バックログの完了予測
- CLI提供によりローカル操作と自動化に利用可能
- GitHub Issueとの双方向同期

## Current Status

tatsumaki is pre-1.0 software. It is suitable for evaluation, local development, and early self-hosted use, but deployment and operations still expect familiarity with Cloudflare Workers, D1, KV, R2, and Cloudflare Access.

## Screenshots

| Stories | Velocity |
|---|---|
| ![Story backlog screenshot](apps/web/test/ui-screenshot/stories.spec.ts-snapshots/stories-backlog.png) | ![Velocity screenshot](apps/web/test/ui-screenshot/stories.spec.ts-snapshots/project-velocity.png) |

| Project settings | API keys |
|---|---|
| ![Project settings screenshot](apps/web/test/ui-screenshot/project-settings.spec.ts-snapshots/project-settings.png) | ![Project API keys screenshot](apps/web/test/ui-screenshot/project-settings.spec.ts-snapshots/project-api-keys.png) |

## 技術スタック

- **API**: Cloudflare Workers + Cloudflare D1
- **CLI**: tatsumakiコマンド
- **デスクトップ**: Electron（viewer shell + CLI refetch IPC）

Desktop 実装手順: [docs/desktop-app.md](docs/desktop-app.md)

## Quick Start

```bash
bash .claude/skills/self-hosting-setup/scripts/safe-local-setup.sh
bun run dev
```

`http://localhost:8787` を開きます。ローカル開発では `apps/web/wrangler.dev.toml` を使い、開発用認証は `dev@localhost` です。

ローカル初回起動から Cloudflare self-hosting 準備まで agent に順番に案内させる場合は、リポジトリ内 skill `self-hosting-setup` を使ってください。

## Self-Hosting Outline

1. tatsumaki 用の Cloudflare Access application を作成し、Audience (AUD) tag と team domain を控える。
2. Deploy to Cloudflare button を押し、求められた Access 値を入力する。
3. Cloudflare に `apps/web/wrangler.toml` で定義された Worker resources を provision させる。
4. Worker dashboard で production custom domain または route を設定する。
5. deploy command で D1 migrations が実行されたことを確認する。

## Deployment Configuration

`apps/web/wrangler.toml` is committed as the public self-hosting configuration. It defines the Worker entrypoint, compatibility settings, static asset binding, D1/KV/R2/Durable Object binding names, cron trigger, and Durable Object migration. It intentionally does not contain Cloudflare Access values or route settings.

Deploy to Cloudflare uses this repository subdirectory:

```text
https://github.com/shwld/tatsumaki/tree/main/apps/web
```

Use these environment-specific settings:

| Area | Values |
|---|---|
| Variables and Secrets | `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` |
| Domains & Routes | Production custom domain or route |
| Bindings | `DB`, `OAUTH_KV`, `STORY_ATTACHMENTS`, `USER_AVATARS`, `PLANNING_POKER_DO`, `ASSETS` |

Recommended Cloudflare Workers Builds settings:

| Field | Value |
|---|---|
| Build command | `bun run build` |
| Deploy command | `bun run deploy` |
| Non-production branch deploy command | `bun run deploy:upload` |
| Path | `apps/web` |

The production deploy commands (`bun run deploy` and `bun run deploy:worker`) apply D1 migrations through the `DB` binding before publishing the Worker so schema changes are not skipped. Non-production branch deploys upload Worker versions without running production database migrations.

`ACCESS_AUD` is the Audience (AUD) tag for the Cloudflare Access application that protects tatsumaki. `ACCESS_TEAM_DOMAIN` is the Access team domain, such as `your-team.cloudflareaccess.com`.

Local deploys can use the root helper:

```bash
bun run deploy:web
```

`wrangler.toml` sets `keep_vars = true`, and `deploy:worker` also passes `--keep-vars`, so dashboard-managed variables are preserved across Wrangler deploys.

References:

- [Cloudflare Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare environment variables and secrets](https://developers.cloudflare.com/workers/configuration/environment-variables/)

## ターゲット

アジャイル開発を行うスクラムチーム

---

## 開発環境セットアップ

### 初回セットアップ

```bash
# 1. 依存インストール（lefthook の Git hook 登録も自動実行される）
bun install

# 2. lefthook が有効か確認
bunx lefthook run pre-commit  # 正常終了すれば OK
```

> **Note**: `bun install` ではルート `postinstall` により `.agents/skills/*` → `.claude/skills/*` の symlink が同期されます。手動のときは `bun run agent-skills:sync`。また lefthook の `postinstall` で Git hook が登録され、手動の `bunx lefthook install` は不要です。

### 品質チェックの全体像

このリポジトリでは **lefthook** (Git hook) で品質ゲートを構成しています。

| タイミング | フック | 実行内容 |
|---|---|---|
| `git commit` 時 | **pre-commit** | config-guard（設定ファイル保護 / 機密ファイル / 破壊的操作）+ 条件付き `lint:custom` + コードの自動フォーマット |
| `git push` 時 | **pre-push** | config-guard（push差分の安全性検査）+ lint → openapi-check → test → typecheck（順次実行・fail-fast） |

### 日常の開発ワークフロー

1. **コード編集** — 通常通りファイルを編集する
2. **コミット** — `git commit` で pre-commit フックが自動実行される
   - 品質ゲート設定ファイル（`lefthook.yml`, `biome.json` 等）への変更がブロックされる
   - 機密ファイル（`.env`, secrets/credential系, 鍵ファイル等）への変更がブロックされる
   - 破壊的操作（危険な削除やデータ破壊コマンド/SQL）を含む差分がブロックされる
   - `apps/web/src/domain/**/*.ts(x)` が staged にある場合のみ `lint:custom` が実行される
   - staged ファイルが biome で自動フォーマットされる
3. **プッシュ** — `git push` で pre-push フックが自動実行される
   - push対象差分に対して config-guard が再検査される（pre-commit バイパス対策）
   - `bun run lint` → `bun run openapi:check` → `bun run test` → `bun run typecheck` が順次実行される
   - すべて通過しないとプッシュできない

### 品質チェック失敗時の対処

#### pre-commit が失敗した場合

```bash
# フォーマットエラーの場合: 自動修正されたファイルを再 stage
git add -u
git commit

# config-guard によるブロックの場合:
# → 正当な変更であれば例外手順に従う（docs/config-guard.md 参照）
```

#### pre-push が失敗した場合

```bash
# 1. どのチェックが失敗したか確認（エラーメッセージに表示される）

# 2. 個別に再実行して原因を特定
bun run typecheck    # 型チェック
bun run lint         # 静的解析
bun run openapi:check  # OpenAPIドリフト検出
bun run test         # テスト

# 3. 原因ファイルを修正し、コミットしてから再度 push
git add <修正ファイル>
git commit -m "fix: ..."
git push
```

#### フックでブロックされた場合

`git commit` / `git push` に `--no-verify` は付けないでください。config-guard が正当な設定変更をブロックした場合は、[docs/config-guard.md](docs/config-guard.md) の例外手順に従ってください。

### 手動での品質チェック実行

```bash
bun run typecheck           # 型チェック (tsc)
bun run lint                # 静的解析 (oxlint + project custom lint)
bun run lint:custom         # project custom lint のみ
bun run test                # テスト (vitest)
bun run format              # 全ファイルフォーマット (biome)
bun run format:staged       # staged ファイルのみフォーマット
```

### ローカルUI検証用データ投入

スクロール確認などでデータ量が必要なときは、以下でローカルD1にダミーデータを投入できます。

```bash
# デフォルト: 20 project x 各40 story
bun run seed:scroll

# 件数指定: 3 project x 各300 story
bun run seed:scroll 3 300
```

再実行時は `seed-scroll-*` プレフィックスの既存シードデータを置き換えます。

カスタムリンター戦略と運用手順は [docs/agent-custom-linter-strategy.md](docs/agent-custom-linter-strategy.md) を参照。

## Web E2E戦略

Web E2E の標準は **accessibility-tree（role/name）優先 + スクリーンショット検証は補助** です。方針と運用分離（エージェントでテスト生成、CIで決定論的実行）の詳細は [Web E2E戦略ガイド](docs/web-e2e-strategy.md) を参照してください。

### UIスクリーンショット差分ワークフロー

PRごとに `.github/workflows/ci.yml` の `ui-screenshot-diff` ジョブが実行され、主要画面のスクリーンショットをベースライン画像と比較します。差分がある場合はジョブが失敗し、`ui-screenshot-diff` artifact に比較結果（actual / expected / diff）が出力されます。

CI はスクリーンショットベースラインを自動更新しません。意図した UI 変更では、開発者がローカルでベースラインを更新してコミットします。

失敗時の標準手順は [UIスクリーンショットテスト運用ガイド](docs/ui-screenshot-test-guide.md) を参照してください。

### スクリーンショット取得ルール

- UIスクリーンショットは **full page screenshot** を標準とする。
- Playwrightでは `expect(page).toHaveScreenshot(...)` を使い、`apps/web/playwright.config.ts` の `expect.toHaveScreenshot.fullPage: true` を維持する。
- 新しいUIスクリーンショットテストを追加する際は、この設定に従って全画面で比較する。
- スクリーンショット差分エラーを「テスト削除・skip」で解消してはいけない。必ず原因を切り分けて修正する。

### ローカルでの実行

```bash
bun run playwright:install
bun run test:ui
```

### ベースライン更新手順

UI変更を意図している場合は、次を実行してスナップショットを更新し、生成された画像をコミットしてください。

```bash
bun run playwright:install
bun run test:ui:update
```

## Sustainability

tatsumaki is developed as open source software. The project is intended to remain self-hostable, while future hosted SaaS offerings may provide managed hosting, operations, backups, updates, and team-oriented convenience features.

If you find tatsumaki useful, you can support ongoing development through GitHub Sponsors.

## Security

Please do not report security vulnerabilities through public GitHub issues. See [SECURITY.md](SECURITY.md) for the private vulnerability reporting process.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening an issue or pull request.

## License

tatsumaki is licensed under the [Apache License 2.0](LICENSE).
