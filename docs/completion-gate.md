# Completion Gate (pre-push)

## 目的

lefthook の `pre-push` フックで品質チェックを強制する。
`git push` 前に lint / openapi-check / test / typecheck を順次実行し、すべて通過しなければプッシュをブロックする。

## 実行フロー

1. `git push` 実行時に lefthook の `pre-push` フックが発火
2. `scripts/completion-gate.sh` が lint → openapi-check → test → typecheck を順次実行
3. 失敗時は統一フォーマットで「失敗コマンド / エラー内容 / 次アクション」を出力

## 実行される品質チェック

| 順序 | コマンド | 目的 |
|------|----------|------|
| 1 | `bun run lint` | 静的解析 (oxlint) — コード品質・バグパターンの検出 |
| 2 | `bun run openapi:check` | OpenAPI 生成物のドリフト検出（CLI contract の同期保証） |
| 3 | `bun run test` | テスト (vitest) — 機能の正しさの検証 |
| 4 | `bun run typecheck` | 型チェック (tsc) — 型安全性の保証 |

チェックは **順次実行** され、最初の失敗で停止する（fail-fast）。

## 失敗時の出力フォーマット

```
[GATE FAILED] <label>
Command: <実行されたコマンド>
Reason:
<エラー出力の末尾30行>

Next: Fix the reported <label> issues above, then retry.
```

## 有効化手順

`bun install` 時に lefthook の `postinstall` フックにより Git hook が自動登録される。
手動で有効化する場合:

```bash
bunx lefthook install
```

## 失敗時対応

1. 失敗ログの `Command` を確認する
2. 該当コマンドをローカルで再実行して原因を特定する
3. 原因ファイルを修正し、コミットしてから再度 `git push` する

## 手動実行

```bash
bash scripts/completion-gate.sh
# 期待: lint/openapi-check/test/typecheck すべて通過で終了コード 0
```

## 設定ファイル

`lefthook.yml` の `pre-push.commands.completion-gate` で `scripts/completion-gate.sh` を登録している。
