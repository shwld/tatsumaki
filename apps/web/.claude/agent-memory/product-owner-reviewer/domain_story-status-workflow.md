---
name: domain_story-status-workflow
description: Story status workflow transitions and estimate requirements based on PivotalTracker conventions
type: project
---

ストーリーのステータス遷移はPivotalTracker準拠:
- Unstarted -> Started -> Finished -> Delivered -> Accepted
- Delivered -> Rejected -> Started (リジェクトフロー)
- feature型のみ、Startするにはestimate(storyPoint)が必要
- chore/bugはestimate不要

ドメインロジックの所在:
- `domain/entities/story.ts`: `canTransitionStoryStatus`, `requiresEstimateForTransition`
- `client/lib/story-status.ts`: `getWorkflowActions` (UIアクション生成、ドメイン関数を呼び出し)

**How to apply:** ステータス遷移に関する変更はドメイン層の関数を起点に確認すること。
