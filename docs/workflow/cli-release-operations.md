# CLI Release Operations

## Purpose

AI や開発者が「CLI のリリースをお願いして」という依頼を受けたときに、同じ手順で実行できるようにする。

## Procedure

リリースは「バージョン同期の PR をマージする」→「タグを push する」の 2 段階で行う。ビルドと Release の公開は `.github/workflows/cli-release.yml` が `cli-v*` タグの push を契機に実行する。

1. 対象バージョン（例: `0.0.16`）に、次のファイルの `version` を同期する PR を作る。コミット名は `chore(cli): sync version metadata to X.Y.Z`。
   - `apps/cli/Cargo.lock`（`tm` パッケージ）
   - `apps/cli/crates/tm/Cargo.toml`
   - `apps/web/src/application/usecases/get-cli-version-compatibility.ts`
   - `apps/web/src/presentation/openapi/cli-openapi.ts`
   - `apps/web/test/cli.route.test.ts`
   - `packages/contracts/cli-openapi.json`
2. PR をマージする。
3. マージ後の `main` の先頭にタグを打って push する。

```bash
git switch main && git pull --ff-only
git tag cli-vX.Y.Z
git push origin cli-vX.Y.Z
```

過去の例: `bb9cf01`（0.0.15 の同期）。

## Verification

```bash
gh release view cli-vX.Y.Z
```

以下の assets が存在すること。

- `tm-aarch64-apple-darwin.tar.gz`
- `sha256sums.txt`

## Preconditions

- `gh` ログイン済み
- Public repository では `cli-v*` tag を maintainer のみが作成できるように保護する

## AI instruction template

自然文依頼を受けたら、AI は最低限以下を確認して実行する。

1. 対象バージョン（例: `0.0.16`）
2. バージョン同期 PR のマージ後にタグを push してよいか

## End-user install

[apps/cli/README.md](../../apps/cli/README.md) の手順で、Release の `tm-<target>.tar.gz` と `sha256sums.txt` を取得して検証する。

## Update

インストール済みの `tm` は自己更新できる。

```bash
tm update            # 最新の cli-v* Release に更新
tm update --check    # 新しいバージョンがあるか確認のみ
tm update --version cli-v0.0.9   # 特定のバージョンを指定
```

- 最新版は GitHub Releases の `cli-v*` タグを semver で比較して決める（`releases/latest` は desktop-v* を指しうるため使わない）
- `sha256sums.txt` で検証してから実行中のバイナリを置換する
- 書き込み権限が無い場合（例: root 所有の `/usr/local/bin/tm`）は `sudo tm update` を案内して終了する
- 配布アセットがある環境のみ対象（現状 `tm-aarch64-apple-darwin.tar.gz` のみ）
