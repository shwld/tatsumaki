---
name: self-hosting-setup
description: "tatsumaki の初回セットアップ、ローカル起動、Cloudflare self-hosting 準備、deploy 前確認、OSS 公開時の README setup 過不足確認を順番に進める。Cloudflare deploy、self-hosting setup、初回セットアップ、ローカル起動、OSS化時のセットアップ確認の依頼で使う。"
---

# self-hosting-setup

## 原則

- safe automation と user-owned/personal steps を分ける。
- secret、API token、domain、Cloudflare dashboard 操作は自動実行しない。
- remote D1 migration、Worker deploy、Cloudflare resource 作成は、ユーザーが明示したときだけ実行またはコマンド提示する。
- repo root から操作する。package script alias は追加しない。

## Workflow

1. **repo 状態確認**
   - `git status --short`
   - `README.md`、`apps/web/wrangler.toml`、`apps/web/wrangler.dev.toml`、`apps/web/package.json` を確認する。
2. **safe local setup**
   - ローカル準備を進める場合は `bash .claude/skills/self-hosting-setup/scripts/safe-local-setup.sh` を実行する。
   - 大量の検証データも必要なら `--seed-scroll` を付ける。
3. **local app 起動確認**
   - script は dev server を起動しない。ユーザーに `bun run dev` を案内する。
   - 起動確認する場合は `http://localhost:8787` を使う。
4. **optional local seed**
   - UI スクロール検証などデータ量が必要な場合だけ seed を使う。
5. **self-hosting readiness check**
   - Cloudflare 手順が必要になったら [references/cloudflare-self-hosting.md](references/cloudflare-self-hosting.md) を読む。
6. **Cloudflare user-owned steps**
   - dashboard、domain、Access、secret 設定は手順またはコマンドを提示し、ユーザーに実行してもらう。
7. **deploy 前確認**
   - remote deploy 前に `TATSUMAKI_D1_DATABASE_ID`、Access values、R2 bucket names、Workers Builds path/commands を確認する。
8. **README/docs 過不足確認**
   - setup 手順を変更した場合は README を短く更新し、詳細は skill/reference に寄せる。
   - 最後に `bash scripts/check-docs-links.sh` と `bash scripts/check-skill-links.sh` を実行する。

## Safe Automation

次は自動実行してよい。

```bash
bash .claude/skills/self-hosting-setup/scripts/safe-local-setup.sh
```

次は seed data が必要なときだけ使う。

```bash
bash .claude/skills/self-hosting-setup/scripts/safe-local-setup.sh --seed-scroll
```

## User-Owned Steps

次は自動実行しない。必要な値を確認し、ユーザーにコマンドまたは dashboard 手順を渡す。

- `wrangler login`
- `wrangler d1 create`
- `wrangler kv namespace create`
- `wrangler r2 bucket create`
- Cloudflare Access Application 作成
- custom domain / route 設定
- runtime variables / secrets 設定
- `bun run deploy:web`

