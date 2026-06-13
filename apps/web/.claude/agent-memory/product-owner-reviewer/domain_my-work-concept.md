---
name: domain_my-work-concept
description: My Work feature - consolidated to filter param, but server-side dead code remains
type: project
---

My Work機能は、issue #204 の画面統合でクライアント側が `?myWork=true` フィルタパラメータに統合された。
独立画面 (`my-work-screen.tsx`) とヘッダーリンクは削除済み。`/my-work` は `/projects` にリダイレクト。

**残存するデッドコード** (2026-04-01時点):
1. `src/presentation/routes/my-work.ts` -- `/api/my-work` エンドポイント（クライアントから呼び出されていない）
2. `src/application/usecases/list-my-work-stories.ts` -- プロジェクト横断ユースケース（同上）
3. `src/index.ts` で `myWorkRoute` がまだマウントされている

**現行の実装**:
- `GET /api/projects/:projectId/stories?myWork=true` -- `ownerId` フィルタとして機能

**How to apply:** My Work関連の変更時はサーバー側デッドコードの削除状況を確認すること。
