# Config Guard

`config-guard` は、**Claude hooks を使わずに lefthook (`pre-commit` / `pre-push`) だけで**安全性ゲートを実施するためのスクリプトです。

- 実装: `scripts/config-guard.sh`
- 実行経路: `lefthook.yml`
- バイパス（承認済み変更のみ）: `CONFIG_GUARD_ALLOW=1`

## ブロック対象

### 1. 品質ゲート設定ファイル

| ファイル | 保護理由 |
|---|---|
| `.oxlintrc.json` | lint ルールの意図しない緩和を防ぐ |
| `biome.json` | format/lint の品質基準の逸脱を防ぐ |
| `lefthook.yml` | フック無効化や経路改変を防ぐ |
| `.claude/settings.json` | エージェント設定の意図しない改変を防ぐ |
| `package.json`（リポジトリルート） | lint/test/typecheck スクリプトの改変を防ぐ |
| `apps/web/package.json` | web の dev / test スクリプトの改変を防ぐ |

### 2. 機密ファイル変更

以下のような機密ファイル・認証情報ファイルへの変更は拒否されます。

- `.env`, `.env.*`, `.envrc`
- `*secret*`, `*credential*`, `*token*` を含むファイル名
- 鍵/証明書ファイル（`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`）
- 代表的な資格情報ファイル（例: `.aws/credentials`, `.netrc`, `.npmrc`）

### 3. 破壊的操作

差分の追加行に以下のようなパターンが含まれる場合は拒否されます。

- 危険な削除: `rm` の再帰削除オプションを `/` や `~` や `*` に向ける操作など
- ワイプ系コマンド: `git clean -fdx`, `find ... -delete`, `mkfs.*`, デバイス直書き込みを伴う `dd` 系
- データ破壊系 SQL: `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE TABLE`, 全件削除系の `DELETE` 文

## フック連携

- `pre-commit`: `CONFIG_GUARD_MODE=pre-commit bash scripts/config-guard.sh {staged_files}`
- `pre-push`: `CONFIG_GUARD_MODE=pre-push bash scripts/config-guard.sh {push_files}`

## 関連フック全体（lefthook）

| タイミング | コマンド | 目的 |
|---|---|---|
| pre-commit | `scripts/config-guard.sh` | 機密ファイル変更・破壊的操作・品質ゲート設定改変をブロック |
| pre-commit | `scripts/hook-agent-custom-lint.sh` | domain配下 TS/TSX が staged のときだけ `lint:custom` を実行 |
| pre-commit | `bun run format:staged` | staged ファイルを自動フォーマット |
| pre-push | `scripts/config-guard.sh` | push 差分で安全性を再検査 |
| pre-push | `scripts/completion-gate.sh` | lint/openapi-check/test/typecheck の完了ゲート |

## 失敗時のフィードバック

拒否時は以下を表示します。

- ブロック種別（例: `Sensitive File Change`, `Destructive Operation`）
- 対象ファイル
- 一致したルール
- 拒否理由
- 次アクション

## テスト

```bash
bash scripts/config-guard.test.sh
```

検証内容:

- 機密ファイル変更が `pre-commit` で拒否される
- 破壊的操作が `pre-commit` で拒否される
- 安全な変更は許可される
- 既存コミット中の破壊的操作が `pre-push` で拒否される

## 例外手順（承認済み変更のみ）

1. 変更理由を Issue/ADR に記録
2. 人間レビュー承認を取得
3. `CONFIG_GUARD_ALLOW=1` で実行
4. `bun run lint`, `bun run test`, `bun run typecheck` を通す

## References

- https://lefthook.dev/configuration/run.html
- https://lefthook.dev/configuration/use_stdin.html
- https://nyosegawa.github.io/posts/harness-engineering-best-practices-2026/
