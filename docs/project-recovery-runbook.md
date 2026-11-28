# プロジェクトの作成・削除の復旧手順

公式ホスト版(`ENTITLEMENT_MODE=control-plane`)で、本体に残る未完了の要求を調べる手順。境界は [ADR-0016](adr/adr-0016-entitlement-provider-boundary.md)。提供者側の調査と対応は提供者の runbook に従う。

## 作成

hourly scheduled が `project_creation_requests` の未完了要求を最大 20 件ずつ提供者に確認する。作成の可否は提供者の回答で決まる。

- `allowed`: 作成する。作成が 10 回失敗した要求は打ち切る。
- `pending`・取得失敗: 5 分から倍々(上限 6 時間)の間隔で再試行する(`next_attempt_at`、`attempt_count`)。
- `denied`・打ち切り: 結果を提供者に通知する。通知できるまで再送する(`outcome_notified`)。

```sql
SELECT project_id, requester_user_id, name, status, stalled_reason, attempt_count,
       materialize_failure_count, last_error, outcome_notified, created_at
FROM project_creation_requests
WHERE status = 'pending' OR outcome_notified = 0
ORDER BY created_at;
```

## 削除

`project_deletion_requests` の行は、オーナーが確認名つきで受け付けた削除で、まだ完了していないもの。完了すると行は消える。受付後は利用の再開を 409 `project_deleting` で拒否し、受付を取り消す操作は持たない。

- 行があり、プロジェクトも残っている: 提供者が削除通知を受け付けていない。hourly scheduled が再試行する。
- 行があり、プロジェクトが無い: 本体の削除直後に途切れた。次の scheduled が行を消す。

```sql
SELECT project_id, requested_by_user_id, attempt_count, last_error, created_at
FROM project_deletion_requests
ORDER BY created_at;
```

`attempt_count` が増え続ける場合は、ログの `Project deletion recovery` と、提供者の状態・Service Binding を確認する。復旧後は次の scheduled を待って行が消えたことを確認する。
