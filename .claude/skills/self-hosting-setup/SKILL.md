---
name: self-hosting-setup
description: "tatsumaki の初回セットアップ、ローカル起動、Cloudflare self-hosting 準備、deploy 前確認、OSS 公開時の README setup 過不足確認を順番に進める。Cloudflare deploy、self-hosting setup、初回セットアップ、ローカル起動、OSS化時のセットアップ確認の依頼で使う。"
---

# self-hosting-setup

## 原則

- safe automation と user-owned/personal steps を分ける。
- API token の作成、team domain の確認、Accessで許可するidentity、custom domainはuser-owned stepとして扱う。
- remote D1 migration、Worker deploy、Cloudflare resource 作成は、ユーザーが明示したときだけセットアップコマンドを実行または提示する。
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
6. **Cloudflare bootstrap**
   - ユーザーがremote構築を明示した場合、API token、Account ID、Access team domain、許可identityを確認して `bun apps/web/scripts/setup-cloudflare.ts` を使う。
   - productionのみが既定。productionとstagingを同時構築する場合は `--with-staging`、productionへ触れず既存環境のstagingだけを構築・修復する場合は `--staging-only` を付ける。
   - hosted stagingをprivate Control Planeへ接続する場合だけ、`--staging-control-plane-service <worker-name>`を追加する。production-onlyでは使わない。
   - 実行前に `--dry-run` でresource planを確認する。
7. **deploy 前確認**
   - remote deploy 前にtoken権限、Account ID、Access team domain、許可identityを確認する。
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

次は自動実行しない。必要な値をユーザーに確認し、dashboard手順を渡す。

- scoped Cloudflare API token 作成
- Cloudflare Account ID と Access team domain の確認
- Accessで許可するemailまたはemail domainの選択
- custom domain / route 設定

ユーザーがremote構築を明示した場合、次のコマンドがD1/KV/R2/Worker/Access/secret/deployを一括で処理する。

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com bun apps/web/scripts/setup-cloudflare.ts --allow-email you@example.com
```

既存productionへ触れずstagingだけを処理する場合は `--staging-only` を付ける。実行前に同じ引数へ `--dry-run` を追加し、`[staging]` だけが表示されることを確認する。

private Control PlaneへService Binding RPCで接続するhosted stagingは、`--staging-only --staging-control-plane-service <worker-name>`を使う。指定しないself-hosted stagingはlocal unlimited entitlementのまま動作する。
