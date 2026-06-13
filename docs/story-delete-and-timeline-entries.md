# ストーリー削除とタイムラインエントリ

## 概要

ストーリー行を削除するとき、`story_timeline_entries` に残るデータは **エントリ種別ごとに挙動が異なる**。

## コメント（`entry_type = 'comment'`）

- 削除前に `deleteAllForStory`（[`delete-story` ユースケース](../apps/web/src/application/usecases/delete-story.ts)）により、当該ストーリーに紐づくコメント行を **明示的に削除**する。
- ストーリー削除後にコメント行が残らないようにするため。

## アクティビティ（`entry_type = 'activity'`）

- スキーマ上 `story_id` は `ON DELETE SET NULL` のため、ストーリー行削除後も **同一行が `story_id = NULL` として残る**場合がある。
- プロジェクト履歴画面など、**プロジェクト単位で時系列を辿る用途**で参照される。

## `deleted` アクティビティ

- ストーリー削除フローでは、削除実行前に **`action: deleted` / `fieldName: story`** のアクティビティを **まだ存在するストーリー ID に紐づけて**記録する。
- その後コメントを削除し、最後にストーリー行を削除する。削除記録のアクティビティ行は、上記 SET NULL により **孤児タイムライン行**として残りうる（意図した監査・履歴のため）。
