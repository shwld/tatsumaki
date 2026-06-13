# CLAUDE Pointer

## Role

Claude Code の入口ドキュメント。詳細は参照先に委譲する。

## References

- [Knowledge Index](docs/knowledge-index.md)
- [Repository Rules](docs/guidelines/repository-rules.md)
- [Story Rules](docs/workflow/story-rules.md)
- [Documentation Management](docs/guidelines/documentation-management.md)
- [ADR Guide](docs/adr-guide.md)
- [ADR-0002](docs/adr/adr-0002-pivotaltracker-ui-design.md)
- [ADR-0003](docs/adr/adr-0003-correctness-over-compatibility.md)
- [ADR-0004](docs/adr/adr-0004-immutable-migration-files.md)
- [実装判断ポリシー](docs/guidelines/implementation-decision-policy.md)

## Execution Gates

1. 実行前に対象 story の `Plan` / `DoD` / `verify` を確認する
2. GitHub Issue や provider CLI の出力を story の正本として扱わない
3. 変更後に `bash scripts/check-docs-links.sh` を実行する
4. `git commit` / `git push` に **`--no-verify`（`-n`）を付けない**（フックを通したうえでコミット・プッシュする）
5. Pull Request 作成時は `.github/pull_request_template.md` のテンプレートに従い、必須セクションを埋める

## Local Dev Shortcuts

- UIスクロール検証向けのダミーデータ投入（リポジトリルート）: `bun run seed:scroll [PROJECT_COUNT] [STORIES_PER_PROJECT]`
- 例: `bun run seed:scroll 3 300`
