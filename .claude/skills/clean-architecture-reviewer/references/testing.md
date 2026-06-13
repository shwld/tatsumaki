# テスト構成

- テストセットアップやDB初期化は helper に集約し、各テストケースへ重複展開しない。
- 新規に追加した振る舞いは、関連するモジュール境界（route/usecase/repository）を跨いで検証する。
- 入力バリデーションを抽出した場合は、route統合テストに加えて、抽出先モジュール（parser/normalizer）の単体テストを追加し、境界責務を固定する。
- UIスクリーンショット差分は `@playwright/test` の専用spec（`test/ui-screenshot.spec.ts`）で運用し、Vitestの通常テスト対象から除外する。
- UIスクリーンショットは full page を標準とし、`apps/web/playwright.config.ts` の `expect.toHaveScreenshot.fullPage: true` を共通設定として維持する。
- CIでは `ui-screenshot-diff` ジョブで `bun run test:ui` を実行し、成功/失敗にかかわらず `test-results/` と `playwright-report/` をartifactとして収集してレビュー可能性を担保する。

## フロントエンドコンポーネント単体テスト方針

- コンポーネントテストは実装ファイルと同じディレクトリに `*.test.tsx` を配置する（例: `src/client/components/story-form.tsx` と `story-form.test.tsx`）。
- 1テストファイルでは `describe("<ComponentName>")` を使い、`it` はユーザー視点の振る舞い文（表示・操作・状態変化）で命名する。
- 検証対象は `loading/error/submitting` のような外部仕様として観測できる状態、props反映、主要イベント（入力変更・submit）を優先する。
- DOM構造やclass名の固定化は避け、Testing Libraryの `getByRole` / `getByText` / `getByDisplayValue` を優先してアクセシブルなUI契約を検証する。
- `getAllByRole(...)[index]` でフォーム部品を選択すると、UI項目の追加・並び替えで誤検知しやすい。複数要素がある場合は `getByLabelText` や `within` で対象を特定してテストを安定化する。
- VitestのWorkers環境テストとは分離し、`jsdom` を使う `vitest.component.config.ts` で実行する。
- CIの `test` ジョブで `bun run test:components` を必須実行にし、PRごとに回帰を検知する。
- `apps/web/vitest.config.ts` は `include: ["test/**/*.test.ts"]` のため、`src/**` 配下の `*.test.tsx` は `bun run test` で実行されない。配置場所と実行コマンドを必ず対で管理する。
- 日時など同一フォーマット文字列が複数描画される画面では、`screen.getByText` の曖昧な predicate 一発検索を避け、`within(section)` や `getAllBy*` で探索範囲/件数を固定してテストの不安定化を防ぐ。

## 参考情報

- Vitest config: https://vitest.dev/config/
- Testing Library guiding principles: https://testing-library.com/docs/guiding-principles
