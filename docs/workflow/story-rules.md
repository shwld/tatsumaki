# Story Rules

## 正本

- story の正本は tatsumaki とする

## 操作経路

- GitHub Issue や provider CLI の出力を story の正本として扱わない
- 外部参照を使う場合も、最終的な状態・要件・進捗は tatsumaki の story に残す

## 実行前チェック

- 対象 story に `## Plan` / `DoD` / `verify` があることを確認する
- 進行中 story は 1 つに限定する
- UI 変更は PivotalTracker 準拠（ADR-0002）を実装計画で明示し、差分がある場合は根拠を記録する
- スコープ外に落とす要件がある場合は、実装前に follow-up story を作成して storyId を残す

## PR マージ後

PR がマージされ、story を **Done 等**へ進める・ローカルを片付けるときの指針（別ドキュメントは置かない）。

- **tatsumaki story**: マージ済み PR に対応する story の status を所定へ進める。
- **ローカル（手動でも可）**: `main` を `git pull`、マージ済み作業ブランチの削除、使っていた別 worktree がある場合は用が済んだら `git worktree remove` 等
- **引き継ぎ**: PR・コミットの参照先を story または PR 本文に残す。

## 参照

- [Repository Rules](../guidelines/repository-rules.md)
