# i18n Translation Rules

## 目的
翻訳キー命名と翻訳ファイル分割の一貫性を維持し、画面ごとの i18n 実装を安全に拡張する。
この規約は `scripts/agent-custom-lint.sh` の `i18n/no-centralized-locale-definitions` ルールで自動検知される。

## 命名規則
- キーは `feature.section.element.action` 形式の lowerCamelCase を使う。
- UI ラベルは名詞、操作は動詞で終える。
- 略語はプロジェクト内で一般化されたものだけ使用する。

## ファイル分割方針
- コンポーネント固有文言はコンポーネント近傍に co-location する（例: `components/layout.i18n.ts`）。
- 画面固有文言は `screen-<name>.i18n.ts` を画面実装近傍に置いて namespace を分離する。
- 1 namespace は 1 つの責務に限定し、過剰に巨大化したら再分割する。

## OK / NG 例
- OK: `layout.notifications.loadError`
- OK: `storyPanel.actions.changeStatus`
- NG: `error1`
- NG: `btnTxt`
