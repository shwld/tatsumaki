# ADR (Architecture Decision Record) ガイド

## ADRとは

ADRは設計上の重要な判断とその背景を記録するドキュメントです。「なぜその判断をしたか」を将来の開発者が参照できるようにします。

## ADRの場所

すべてのADRは `docs/adr/` ディレクトリに格納されています。

```
docs/adr/
├── template.md              # ADR テンプレート
├── adr-0001-*.md            # 個別の ADR
└── ...
```

## ADR の参照方法

### 一覧を見る

```bash
ls docs/adr/adr-*.md
```

### 特定のADRを読む

ファイル名は `adr-NNNN-kebab-case-title.md` の形式です。番号とタイトルから内容を推測できます。

### メタデータで絞り込む

```bash
# accepted 状態のADRを探す
grep -l 'status.*accepted' docs/adr/adr-*.md

# 特定の enforcement を探す
grep -l 'enforcement.*ci-check' docs/adr/adr-*.md
```

## PRでの ADR 記載

変更に関連するADRがある場合は、PR本文の `Summary` または `Test Plan` に ADR番号とファイルパスを記載します。

例: `ADR-0001 (docs/adr/adr-0001-adopt-adr-process.md)`

## 新しいADRの作成手順

1. `docs/adr/template.md` をコピーして新しいファイルを作成する
   ```bash
   cp docs/adr/template.md docs/adr/adr-NNNN-your-title.md
   ```
2. 番号は既存ADRの最大番号 + 1 を使用する
3. メタデータ（status, deciders, date, enforcement）を埋める
4. Context, Decision, Consequences を記述する

## ADR更新時の対応ルール確認手順

ADRを追加・更新した場合は、次の手順で「設計判断」と「実行可能ルール」の整合を確認する。

1. 変更したADRの `Decision` と `Consequences` を確認する
2. 既存のテスト・lint・hook で担保できるか確認する
3. 不足がある場合は、必要な検証を追加する
4. PR本文に関連ADRと確認結果を記録する

## 関連リンク

- ADR テンプレート: [docs/adr/template.md](adr/template.md)
- ADR プロセスの決定: [docs/adr/adr-0001-adopt-adr-process.md](adr/adr-0001-adopt-adr-process.md)
