# 課金: 決済後のプロジェクト作成の自動復旧と調査手順

story #432。方針は [ADR-0015](adr/adr-0015-project-scoped-billing.md) の「決済の完了後に作成が失敗した場合」に従う。

## 自動復旧の動き

- 既存の hourly scheduled（`0 * * * *`）が `project_creation_requests` の未完了要求を最大 20 件ずつ処理する。`CHECKOUT_ENABLED=true` のときだけ動く。
- 成功画面の complete と同じ冪等な `materialize` を使う。並行・再実行しても本体は 1 つ。Control Plane で `active` を確認できた要求だけ作成する。
- 他の scheduled 処理（iteration・artifact cleanup）とは別の `waitUntil` で、失敗が互いに影響しない。

## 再試行と打ち切り

- 再試行間隔は 5 分から倍々、上限 6 時間（`next_attempt_at`）。試行回数は `attempt_count`。
- 支払いの形跡（`grace` を観測した、または過去に作成を試みている。`payment_evidence` に記録）が無いまま `active` にならず 3 日経過: `stalled_reason = 'abandoned'`（離脱した未払い。対応不要、再試行しない）。
- 支払いの形跡があるのに 7 日経っても `active` にならない: 要調査（`entitlement_unconfirmed`）。
- `active` だが作成が 10 回失敗: `stalled_reason = 'creation_failed'`（要調査）。
- 7 日経っても権利を確認できない: `stalled_reason = 'entitlement_unconfirmed'`（要調査）。

## 要調査の特定

ログに `billing.creation.needs_investigation`（projectId・purchaserUserId・reason）が出る。DB では次で一覧する。

```sql
SELECT project_id, purchaser_user_id, name, stalled_reason, attempt_count, last_error, created_at
FROM project_creation_requests
WHERE status = 'pending' AND stalled_reason IN ('creation_failed', 'entitlement_unconfirmed');
```

## 運用者の対応

1. Control Plane で projectId の購読が `active` か確認する。
2. 原因（DB 障害・Control Plane 障害など）を解消し、`stalled_reason`・`next_attempt_at` を NULL、`attempt_count`・`materialize_failure_count` を 0 に戻すと次回の scheduled で再試行される。
3. 復旧できない場合は Stripe ダッシュボードで返金し、購読を解約する。返金の実行は自動化しない。
