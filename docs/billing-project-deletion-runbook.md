# 課金: プロジェクト削除の復旧手順

story #444。方針は [ADR-0015](adr/adr-0015-project-scoped-billing.md) を参照する。削除では購読を即時に解約し、未使用期間は返金しない。

## 状態

`project_deletion_requests` の行は「オーナーが確認名つきで受け付けた削除で、まだ完了していないもの」を表す。完了すると行は消える。

- 行があり、プロジェクトも残っている: Control Plane の解約を確認できていない。1 時間ごとの scheduled が再試行する。
- 行があり、プロジェクトが無い: 本体削除の直後に途切れた。次の scheduled が行だけを消す。

## 未完了の一覧

```sql
SELECT project_id, requested_by_user_id, attempt_count, last_error, created_at
FROM project_deletion_requests
ORDER BY created_at;
```

`attempt_count` が増え続けるものは Control Plane 側の障害を疑う。ログの `Project deletion recovery` を確認する。

## 運用者の対応

1. Control Plane が復旧していることを確認する(本体側のスキーマや binding の不整合も含む)。
2. 次の scheduled を待つか、`closeProjectBilling({ projectId })` を直接呼んでから、行が消えたことを確認する。
3. 削除済みなのに課金が残っていると問い合わせがあった場合は、Control Plane の runbook に従い `listProjectBilling` で生きた購読が無いことを確認する。

## 注意

- 再購読は、削除要求の受付後は拒否される(HTTP 409 `project_deleting`)。受付を取り消す操作は用意しない。
- 削除後に完了した Checkout の購読は解約されるが、支払い済みの金額は自動返金しない。運用者が Stripe で返金を判断する。
