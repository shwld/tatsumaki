# ADR-0005: イテレーションは cron 専用管理とする

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-04-05
- **enforcement**: ci-check

## Context

tatsumaki では PivotalTracker に倣い、イテレーション（スプリント）を自動管理する設計としている。Cloudflare Workers の cron trigger（毎時）が `ensureCurrentIteration` を呼び出し、今日を含むイテレーションが存在しなければ自動作成する。

しかし、開発初期に手動作成 API（`POST /projects/:projectId/iterations`、`DELETE /projects/:projectId/iterations/:iterationId`）が残っており、以下の問題が発生した:

1. 手動で未来のイテレーションが作成された
2. `ensureCurrentIteration` は「最新イテレーションが未来にある」ケースを想定しておらず、今日をカバーするイテレーションを作成できなかった
3. フロントエンドの DnD（Backlog → Current）が `currentIteration === null` で silent fail した

## Decision

**イテレーションの作成・削除は cron（`ensureCurrentIteration`）のみが行う。手動の作成・削除 API は提供しない。**

具体的には:

- `POST /projects/:projectId/iterations`（手動作成）を削除
- `DELETE /projects/:projectId/iterations/:iterationId`（手動削除）を削除
- `ensureCurrentIteration` に「最新が未来」のケースを追加（未来イテレーションを削除して正しいものを再作成）
- ストーリーのイテレーション割当・解除 API は残す（DnD 用）

## Consequences

### 良い点

- イテレーション管理が単一の経路（cron）に集約され、不整合が起きない
- `ensureCurrentIteration` のロジックが唯一の正本となり、テスト・検証が容易
- 手動操作による未来イテレーション作成のリスクが排除される

### 注意点

- cron が停止するとイテレーションが作成されない（ページ読み込み時の lazy ensure は意図的に入れていない — GET に副作用を持たせない方針）
- 過去のイテレーションを手動で修正する手段がない（必要になった場合は DB 直接操作 or 新しい管理 API を検討）
