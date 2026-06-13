# ADR-0009: Manage Sprint Utilization by Iteration Number with Overrides

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-04-22
- **enforcement**: manual

## Context

PivotalTracker 互換の運用では、スプリント稼働率は日付や iteration レコードの有無ではなく、`iteration_number` を軸に扱う必要がある。

従来の `iterations.sprint_utilization_percent` ベースでは、次の問題があった:

1. future iteration レコードが未生成だと先行設定できない
2. 稼働率設定が iteration レコードの作成タイミングに依存してしまう
3. Pivotal の `iteration_override` モデル（番号基準）と一致しない

## Decision

**稼働率は `iteration_number` 基準の override テーブルで管理し、future iteration 未生成でも override を先に保存可能にする。**

具体的には:

- `iterations` に `iteration_number`（project 内連番, unique）を持たせる
- `iteration_overrides(project_id, iteration_number, sprint_utilization_percent)` を正本とする
- default は常に 100 とし、non-default のみ override レコードで保持する
- `PATCH /projects/:projectId/iterations/:iterationNumber/override` で設定する
- `DELETE /projects/:projectId/iterations/:iterationNumber/override` で default(100) に戻す
- `PATCH` で 100 が指定された場合も override を保存せず削除扱いにする
- 稼働率設定時に `iterations` 本体は生成しない
- 予測/表示は `effectiveSprintUtilizationPercent`（override 優先、なければ 100）を使う

## Consequences

### 良い点

- future iteration レコード未生成でも、将来 sprint の稼働率を先行設定できる
- 稼働率管理が Pivotal 互換の番号基準に統一される
- iteration 作成タイミングと稼働率設定を分離できる

### 注意点

- 番号基準のため、実績期間との厳密一致より Pivotal 互換性を優先する設計になる
- `iterations.sprint_utilization_percent` は段階的廃止対象として扱い、参照しない前提を維持する必要がある
