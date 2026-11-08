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

## セクションと部品（story #388）

- Stories 以外の画面は、共通コンポーネント `ProjectSection`（`apps/web/src/client/components/project-section.tsx`）でセクションを組む
- 見出しは h2 `text-base font-semibold`、枠は `rounded-md border p-4`、セクション間は親の `space-y-6`
- `width="readable"`（既定）はフォーム・設定・一覧など読み取りと入力が中心のセクションで `max-w-3xl` とし、大画面で伸びすぎないよう左寄せにする
- `width="full"` は表・グラフなど広さが要るセクションで使い、幅制限を付けない（Velocity の表・グラフ、Project History の表、Artifact preview）
- `tone` は `notice`（一度きりの通知）と `danger`（破壊的操作）のみ。画面ごとに色を複製しない
- ページコンテナに `max-w-*` を付けない原則は変わらない。幅は `ProjectSection` が決める

## ADR-0002 との整合

PivotalTracker 準拠（[ADR-0002](../adr/adr-0002-pivotaltracker-ui-design.md)）では、projects 配下の画面は全幅のワークスペースとして扱う。本ガイドはその枠組みを画面間で揃えるための基準であり、画面固有の挙動は ADR-0002 に従う。
