# Lint Error Message Template

カスタムリンターのエラーメッセージは、エージェントが 1 回の再試行で自己修正できることを目的として、以下の形式に統一する。

## Required Format

```text
ERROR: [<RULE_ID>]
WHY: <なぜ違反なのか。ルール意図と失敗条件を1-2文で説明>
FIX: <修正手順を命令形で具体的に説明>
EXAMPLE: <最小の修正例。1-2行>
REFERENCE: <根拠ADRまたはルール根拠ドキュメントへのパス/URL>
```

## Writing Rules

- `WHY` はルールの目的と今回の違反事実を明確に書く
- `FIX` は「何をどこに書くか」が分かる粒度で書く
- `EXAMPLE` は最短で再現できる差分例にする
- `REFERENCE` は必須。`docs/adr/*.md` か運用ドキュメントを指定する
- 新規ルール追加時は、このテンプレートに準拠したメッセージを実装する

## Source

- https://nyosegawa.github.io/posts/harness-engineering-best-practices-2026/
