# UIスクリーンショットテスト運用ガイド

このガイドは、`apps/web/test/ui-screenshot/` 配下のスクリーンショットテストの失敗を対症療法ではなく根本原因で解消するための標準手順です。
Web E2E 全体の標準方針（accessibility-tree 優先）は `docs/web-e2e-strategy.md` を参照してください。

## 原則

- テストの削除・`skip`・しきい値の安易な緩和で失敗を隠さない。
- 差分が「意図した変更」か「意図しない変更」かを先に判定する。
- 意図した変更ならベースライン更新、意図しない変更ならコード修正を行う。

## 0. 失敗の再現

まずローカルで同じテストを再実行して再現させる。

```bash
bun run playwright:install
bun run test:ui
```

## 1. 差分の確認

失敗時は以下を確認する。

- ローカル: `apps/web/test-results/` の `actual / expected / diff`
- CI: `ui-screenshot-diff` artifact（`test-results/` と `playwright-report/`）

判定基準:

- 仕様どおりのUI変更が写っている -> 意図した変更
- レイアウト崩れ・予期しない文言差分・読み込み途中状態 -> 意図しない変更

## 2-A. 意図した変更の場合（ベースライン更新）

```bash
bun run test:ui:update
bun run test:ui
```

対応内容:

- `apps/web/test/ui-screenshot/<screen>.spec.ts-snapshots/*.png` の差分を確認
- 変更意図と一致していることを確認してコミット
- PR説明に「なぜ画像更新が必要か」を明記

## 2-B. 意図しない変更の場合（根本原因修正）

ベースラインは更新せず、まず原因を修正する。

代表的な確認項目:

- テストデータが固定されているか（APIレスポンスのモック、日時、ID）
- 非決定要素が排除されているか（アニメーション、タイムゾーン、ロケール）
- 画面描画前に十分待てているか（見出し・主要要素の表示確認）
- 変更がスクリーンショット対象外の画面にも影響していないか

修正後に実行:

```bash
bun run test:ui
```

`test:ui` が通るまで繰り返す。通過後に必要なコードのみコミットする。

## 3. PR前チェック

以下をすべて満たすこと:

- `bun run test:ui` がローカルで成功
- CIの `ui-screenshot-diff` が成功
- 画像更新がある場合、変更意図をPRに記載
- テスト削除や`skip`で回避していない

## 補足コマンド

特定テストのみ再実行:

```bash
bun run test:ui -- -g "project list screen"
```

## ファイル配置ルールと命名規則

テストファイルは `apps/web/test/ui-screenshot/` に配置し、screen の種別（ドメイン領域）ごとに分割する。

```
test/ui-screenshot/
  helpers.ts              # 共通モックデータ・ユーティリティ
  login.spec.ts           # ログイン画面
  projects.spec.ts        # プロジェクト関連画面（一覧・作成）
  stories.spec.ts         # ストーリー関連画面（一覧・作成・編集・バックログ）
  <screen>.spec.ts        # 新しい画面を追加する場合
```

### ルール

- **ファイル名**: `<screen-domain>.spec.ts`（例: `login.spec.ts`, `projects.spec.ts`）
- **スナップショット名**: `<screen-domain>-<action>.png`（例: `projects-new.png`, `stories-list.png`）
- **共通処理**: `helpers.ts` にモックデータ・認証ヘルパーを集約し、各specからimportする
- **1ファイル = 1ドメイン領域**: 関連する画面をまとめ、無関係な画面は別ファイルに分離する
- **スナップショット配置**: Playwrightの `snapshotPathTemplate` により `<spec-file>-snapshots/` に自動配置される
