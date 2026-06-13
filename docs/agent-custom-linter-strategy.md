# Agent Custom Linter Strategy

エージェント実装で再発しやすいアンチパターンを、既存の汎用 lint（oxlint）に加えてプロジェクト固有ルールで検知するための運用定義。

## 導入したカスタムルール

| Rule ID | Category | 実装状態 | 概要 |
|---|---|---|---|
| `boundary/no-domain-import-from-outer-layers` | 依存境界 | **Implemented** | `apps/web/src/domain` 配下から `application/presentation/infrastructure/client` への import を禁止 |
| `i18n/no-centralized-locale-definitions` | 配置予測性 (Glob-ability) | **Implemented** | `apps/web/src/client/i18n` 直下への locale 定義（`*.json` / `*.ja.ts` / `*.en.ts` / `*.i18n.ts`）を禁止し、コンポーネント/画面近傍への co-location を強制 |
| `grep/no-ambiguous-error-token` | 検索性 (Grep-ability) | Planned | エラー識別子を固定プレフィックス（例: `TMK_`）で統一し、grep の再現性を上げる |
| `glob/predictable-artifact-location` | 配置予測性 (Glob-ability) | Planned | 成果物の出力先を定義済みディレクトリに限定し、glob 依存ジョブの破綻を防ぐ |
| `security/no-secret-in-env-logs` | セキュリティ | Planned | token / secret 相当値のログ出力パターンを禁止 |

## 実行方法

```bash
# 既存 lint + カスタムリンター
bun run lint

# カスタムリンターのみ
bun run lint:custom

# 想定違反/非違反の fixture テスト
bun run lint:custom:test
```

CI では `.github/workflows/ci.yml` の `lint` ジョブで `bun run lint` を実行するため、上記カスタムルールも同時に評価される。

lefthook では以下の導線で実行される。

- pre-commit: `apps/web/src/domain/**/*.ts(x)` が staged にある場合のみ `scripts/hook-agent-custom-lint.sh` から `bun run lint:custom` を実行
- pre-push: `scripts/completion-gate.sh` 内の `bun run lint` で実行

## エラーメッセージ形式

違反時の出力は `docs/lint-error-message-template.md` に準拠し、以下の5要素を必須とする。

- `ERROR: [<RULE_ID>]`
- `WHY: ...`
- `FIX: ...`
- `EXAMPLE: ...`
- `REFERENCE: ...`

## 誤検知率と運用コストの評価手順

### 計測期間
- 1 スプリント（2 週間）を 1 サンプル期間とする

### 計測対象
- `lint:custom` の違反件数
- そのうち「実際に修正が必要だった件数」
- triage / 修正に要した時間（分）

### 判定方法
1. PR ごとに `lint:custom` の失敗件数を記録する
2. 各違反を `true-positive` / `false-positive` に分類する
3. 以下を算出する
   - 誤検知率 = `false-positive / total-detections`
   - 運用コスト = `triage時間 + 修正時間`
4. しきい値
   - 誤検知率 20% 超: ルールの正規表現/対象範囲を見直す
   - 1件あたり運用コスト 10分超: エラーメッセージ改善 or ルール分割を検討する

### 見直し頻度
- 各スプリントのレトロでレビューし、必要なら次スプリントで調整 Issue を起票する

## ロールアウト手順

1. `scripts/agent-custom-lint.sh` にルールを追加
2. `docs/agent-custom-linter-strategy.md` の対応表を更新
3. `bun run lint:custom:test` で想定ケースを確認
4. `bun run lint` / `bun run test` を通し、CI で `lint` ジョブの結果を確認する

## ロールバック手順

1. `package.json` の `lint` から `lint:custom` を一時的に外す
2. 問題ルールを `scripts/agent-custom-lint.sh` から削除または無効化
3. 原因と再導入条件を Issue に記録する
