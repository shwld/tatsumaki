# Label ID API 移行と release note

story の Label 所属を Label ID だけで扱うようにした変更(story #381、[ADR-0013](adr/adr-0013-label-bound-epic-planning.md))の破壊的変更と、デプロイ後の確認手順。

## 破壊的変更(release note)

- Web API・CLI API・MCP は Label 名の配列 `labels` を入力として受け付けない。`labels` を送ると 400 を返す。`labelIds`(全置換)、`addLabelIds`、`removeLabelIds` を使う
- story 一覧の絞り込み `labels` / `label`(名前)は `labelIds`(ID のカンマ区切り、OR)に置き換わった。`labels` / `label` を送ると 400 を返す
- `PATCH /projects/:projectId/stories/bulk-labels` は `labels` ではなく `labelIds` を受け取る
- 保存済みフィルターの条件 `labels` は `labelIds` に置き換わった。`labels` を送ると 400 を返す
- story のレスポンスの `labels`(名前)は表示用で、書き込みには使えない。参照元は `labelIds`
- `tm story create / update / list` に `--label` などを追加した。名前は CLI が ID に解決する
- MCP の `update_story` の `labels` は `labelIds` / `addLabelIds` / `removeLabelIds` に、`create_story` と `list_stories` は `labelIds` を受け取る
- Web の URL クエリ `labels` は `labelIds` に変わった。古い URL の絞り込みは無視される
- `stories.labels` カラムを廃止した(migration 0063)。所属の参照元は `story_labels` だけ

## Project History

Label の変更は Label ID で記録し、表示時に現在の Label 名を出す。削除された Label は `(deleted label)` と表示する。この変更より前の記録は当時の Label 名のまま残る。

## 保存済みフィルターの変換結果

migration 0062 が保存済みフィルターの `labels`(名前)を同じ project の Label ID に変換する。変換できない名前(その project に無い Label)はフィルターから外し、`saved_filter_label_conversion_report` に残す。

```bash
bunx wrangler d1 execute DB --remote --command "SELECT count(*) AS dropped_conditions, count(DISTINCT saved_filter_id) AS affected_filters FROM saved_filter_label_conversion_report"
bunx wrangler d1 execute DB --remote --command "SELECT saved_filter_id, project_id, label_name FROM saved_filter_label_conversion_report ORDER BY project_id, saved_filter_id"
```

件数が 0 でなければ、影響を受けた保存済みフィルターの持ち主に条件の再設定を案内する。

## デプロイ順

1. 0062 を適用する前に、全 client(Web・CLI・MCP)が ID ベースの版であることを確認する
2. migration 0062、0063 を適用する。0063 は `stories.labels` を消すので、適用後に旧版 client へは戻せない
3. 上のクエリで変換結果を確認する
