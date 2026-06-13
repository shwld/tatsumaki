---
name: domain_icebox-panel-gap
description: Icebox panel exists in UI but no stories map to it - missing Iteration/Sprint domain concept
type: project
---

Iceboxパネルが `panel-visibility.ts` で定義されUIに表示されるが、`story-panel-grouping.ts` の `storyStatusToPanel()` にIceboxへのマッピングがなく、常に空。

**根本原因**: PivotalTrackerではIceboxはステータスではなく、Iteration(Sprint)に未割当のストーリーを指す。
現在のドメインモデルにはIteration概念がないため、Current/Backlog/Iceboxの区別ができない。
- `Unstarted` -> Backlog にマッピングされている
- Iteration概念なしではBacklogとIceboxの区別が不可能

**Why:** PivotalTracker準拠のUIを目指しているが、ドメインモデルが追いついていない。
**How to apply:** Iteration/Sprint概念の導入が検討される際、このギャップを解消すること。UIからIceboxを一旦除外するか、ドメインを拡張するかの判断が必要。
