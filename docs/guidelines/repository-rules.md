# Repository Rules

## 目的
リポジトリ横断で守る共通ルールを定義する。

## 共通原則

- 根本解決を優先し、対症療法を避ける
- 依存ライブラリ側で解決済みなら、アップグレードを優先する
- 一時回避を入れる前に必要性を再確認する
- `typecheck` / `lint` / `test` / `format` が通る状態を維持する
- 命名と設計パターンを全体で一貫させる

## 開発ルール

- ターミナルでは、すでに目的のカレントディレクトリにいるときは `cd` しない。それ以外も不要な `cd` は避ける。リポジトリ内スクリプトは **カレントディレクトリ起点の相対パス** で指定し、ホームからの絶対パスは使わない。`apps/web` のビルド・テスト等は **repo root** の `bun run <script>` で委譲する（例に `bun run --cwd apps/web …` を載けない。必要なスクリプトはルート `package.json` にエイリアスを足す）
- 依存導入は必ず **repo root** で `bun install` を実行する（`apps/*` 直下での個別 `bun install` は行わない）
- 日常コマンドは原則 repo root から実行する。テスト系は `bun run test` / `bun run test:components` / `bun run test:ui` / `bun run test:ui:update` / `bun run typecheck` を優先し、アプリ配下のスクリプトを直接叩く場合は例外として扱う
- 仕様不明点は「実装か提案か」「完成度」「制約」を先に確認する
- 変更は最小スコープで行い、無関係なリファクタを混ぜない
- 既存ルールを変更する場合は、対象ドキュメントと理由を同一PRで更新する
- UI/UX 変更は ADR-0002 に従い、PivotalTracker を正として挙動差分を確認する
- PivotalTracker 準拠のために意図的にスコープから落とす要件は、必ず tatsumaki の follow-up story を起票して追跡可能にする
- **Git（エージェント含む）**: `git commit` / `git push` に `--no-verify`（`-n`）を付けない
- **Pull Request（エージェント含む）**: PR 作成時は必ず `.github/pull_request_template.md` のテンプレートに従い、必須セクションを埋める

## 参照

- [Repository Overview](../../README.md)
- [Documentation Management](documentation-management.md)
- [i18n Translation Rules](i18n-translation-rules.md)
