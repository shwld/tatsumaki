# AGENTS Pointer

## Role

Codex の入口ドキュメント。実行開始に必要な最小情報のみを示す。

## References

- [Knowledge Index](docs/knowledge-index.md)
- [Repository Rules](docs/guidelines/repository-rules.md)
- [Story Rules](docs/workflow/story-rules.md)
- [CLI Release Operations](docs/workflow/cli-release-operations.md)
- [Documentation Management](docs/guidelines/documentation-management.md)
- [i18n Translation Rules](docs/guidelines/i18n-translation-rules.md)
- [ADR Guide](docs/adr-guide.md)
- [Desktop App](docs/desktop-app.md)
- [実装判断ポリシー](docs/guidelines/implementation-decision-policy.md)

## Execution Gates

1. story の `Plan` / `DoD` / `verify` を確認する
2. 変更前に参照先ドキュメントを読む
3. 実装後に `bash scripts/check-docs-links.sh` を実行する
4. `git commit` / `git push` に **`--no-verify`（`-n`）を付けない**（フックを通したうえでコミット・プッシュする）
5. Pull Request 作成時は `.github/pull_request_template.md` のテンプレートに従い、必須セクションを埋める

## Local Dev Shortcuts

- UIスクロール検証向けのダミーデータ投入（リポジトリルート）: `bun run seed:scroll [PROJECT_COUNT] [STORIES_PER_PROJECT]`
- 例: `bun run seed:scroll 3 300`
