# 既存 Epic と Label の接続 preview

## 目的

migration `0061_connect_epics_to_same_name_labels.sql` は、既存の Epic を同名の Label に接続し、旧 `stories.epic_id` の所属 story にその Label を付ける([ADR-0013](adr/adr-0013-label-bound-epic-planning.md) Data migration step 3)。接続は Label 名の完全一致で行うので、意味の違う同名 Label があると、無関係な story が Epic に入る。

デプロイ済みの DB に適用する前に、以下の読み取り専用クエリで影響を確認し、project owner が接続内容に合意する。

## 手順

`<prefix>-db` は対象環境の D1 データベース名。すべて `SELECT` だけで、データは変更しない。

### 1. 接続先の Label

既存の同名 Label に接続されるか、新しい Label が作られるかを確認する。`existing_label_id` が空の Epic には、同名の Label が新しく作られる。

```bash
bun run wrangler d1 execute <prefix>-db --remote --command "
SELECT e.project_id, e.id AS epic_id, e.name AS epic_name, pl.id AS existing_label_id,
  length(trim(e.name)) AS name_length
FROM epics e
LEFT JOIN project_labels pl ON pl.project_id = e.project_id AND pl.name = trim(e.name)
WHERE e.label_id IS NULL
ORDER BY e.project_id, e.name"
```

- `name_length` が 50 を超える Epic は、Label 名の上限(50 文字)を超える Label になる。先に Epic 名を短くする

### 2. 接続で Label が増える story

既存の同名 Label に接続される Epic について、Label をまだ持っていないのに Epic 経由で Label が付く story と、Epic には入っていなかったのに同名 Label を持っているため Epic に入る story を確認する。

```bash
bun run wrangler d1 execute <prefix>-db --remote --command "
SELECT e.project_id, e.name AS epic_name,
  sum(CASE WHEN s.epic_id = e.id AND sl.story_id IS NULL THEN 1 ELSE 0 END) AS stories_gaining_label,
  sum(CASE WHEN sl.story_id IS NOT NULL AND (s.epic_id IS NULL OR s.epic_id <> e.id) THEN 1 ELSE 0 END) AS stories_joining_epic_by_label
FROM epics e
JOIN project_labels pl ON pl.project_id = e.project_id AND pl.name = trim(e.name)
JOIN stories s ON s.project_id = e.project_id
LEFT JOIN story_labels sl ON sl.story_id = s.id AND sl.label_id = pl.id
WHERE e.label_id IS NULL
GROUP BY e.id
ORDER BY e.project_id, e.name"
```

`stories_joining_epic_by_label` が多い Epic は、同名 Label が別の意味で使われている可能性がある。

### 3. 判断

- 同名 Label が Epic と別の意味なら、migration 適用前にその Label を Web の Label 設定で別名に変更する。変更後は手順 1 から確認し直す
- 内容に合意できたら migration を適用する。接続された Epic は planning ON で始まり、ID と description を保つ
