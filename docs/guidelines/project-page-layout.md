# Project Page Layout

## 目的
`/projects/:projectId/*` 配下の画面で、ヘッダ（Layout + ProjectNav）直下の枠・見出しを統一する。

## 基準レイアウト

- 基準は stories / history（story #325）。共通コンポーネント `ProjectPage`（`apps/web/src/client/components/project-page.tsx`）を使う
- ヘッダ直下に背景カード・灰背景無しで全幅コンテンツ（`px-4 py-6`）
- 見出し h1 は `text-xl font-semibold text-gray-900`、下余白 `mb-6`
- アクション領域は見出しと同じ行の右側に置く（`actions`）
- ローディング / エラー / 空状態も `ProjectPage` の本文内に置く

## 幅の制限

- ページコンテナは常に全幅にし、`max-w-*` を付けない
- 可読性のために幅を絞る場合は、フォーム / セクション単位で `max-w-*` を指定する

## ADR-0002 との整合

PivotalTracker 準拠（[ADR-0002](../adr/adr-0002-pivotaltracker-ui-design.md)）では、projects 配下の画面は全幅のワークスペースとして扱う。本ガイドはその枠組みを画面間で揃えるための基準であり、画面固有の挙動は ADR-0002 に従う。
