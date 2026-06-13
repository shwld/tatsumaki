---
name: clean-architecture-reviewer
description: "コードのクリーンアーキテクチャ準拠をレビューする。レイヤリング、依存方向、凝集性、DRY、境界設計を検証。「アーキテクチャをレビューして」「クリーンアーキテクチャに準拠してるか確認して」「実装後のアーキテクチャチェックして」「この設計が正しいか確認して」の依頼で使う。コードの実装・修正は行わない。"
---

## 何をしないか

- コードの実装・修正は行わない（レビューのみ）
- ドメイン仕様の妥当性検証は行わない
- 機能要件のレビューは行わない

ペルソナ・評価軸・出力形式の正本は **`.claude/agents/clean-architecture-reviewer.md`**。`references/` を読み Agent を叩く手順メモのみ [references/procedure-detail.md](references/procedure-detail.md)。

## 使用

```bash
claude "/clean-architecture-reviewer apps/web/src/server"
codex "/clean-architecture-reviewer apps/web/src/server"
```

引数省略時は `git diff main`。読み込み対象リストは [references/architecture.md](references/architecture.md)。
