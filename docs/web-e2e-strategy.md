# Web E2E戦略ガイド（accessibility-tree優先）

このガイドは Web E2E の標準方針を定義する。基本方針は **構造化テキスト優先（アクセシビリティツリー）** とし、スクリーンショット検証は補助的に扱う。

## 方針

- 画面操作・検証は `getByRole` / `getByLabel` / `getByText` などアクセシビリティツリー由来の locator を優先する
- `page.locator(".class")` や DOM 構造依存の selector は、role/name で表現できない場合を除いて使わない
- 期待値は意味のある UI 状態（見出し、フォーム送信結果、遷移、エラー表示）を検証する

## 標準パターン（role/name ベース）

1. 事前条件を API モックで固定する（データ、日時、順序）
2. `page.goto()` 後、`getByRole` / `getByLabel` で操作する
3. 完了条件は `toHaveURL`、`toBeVisible`、`toHaveText` で確認する
4. テスト名でユーザー行動を表現する（例: `project create flow`）

実装例は `apps/web/test/ui-screenshot/projects.a11y-flow.spec.ts` を参照。

## スクリーンショット検証を使う条件

スクリーンショットは次のケースで使う。

- 視覚回帰: 主要画面の見た目崩れ・余白・色・タイポグラフィの退行検知
- canvas / chart: role/name だけでは意味差分を表現しづらい描画
- 複合レイアウト: レスポンシブ切り替えや複数領域のレイアウト整合性

運用手順は `docs/ui-screenshot-test-guide.md` を参照。

## スクリーンショット検証の非推奨条件

次の用途ではスクリーンショットを主手段にしない。

- フォーム送信成功・失敗、権限エラー、遷移などの振る舞い検証
- ボタン活性/非活性や文言変化など、role/name/assertion で決定論的に検証できる状態
- 一時的なロード状態に依存する flaky な確認

これらは accessibility-tree ベースの assertion へ置き換える。

## エージェント生成と CI 実行の分離

### 役割

- エージェント（開発時）
  - 仕様から role/name ベースのシナリオを生成・更新する
  - ローカルで失敗を再現し、原因を修正する
  - 必要な場合のみスクリーンショットベースラインを更新する
- CI（検証時）
  - 既存テストを決定論的設定で実行する
  - 成否判定のみを担当し、テスト生成や仕様判断は行わない

### 手順

1. エージェントがテストコードを更新する
2. ローカルで `bun run test:ui` を実行して再現性を確認する
3. CI で同コマンドを実行し、同じ結果になることを確認する
4. 失敗時はテストを緩和せず、モック・待機条件・UI実装の根本原因を修正する

## 参考情報源

- Harness Engineering Best Practices 2026
  - https://nyosegawa.com/posts/harness-engineering-best-practices-2026/
