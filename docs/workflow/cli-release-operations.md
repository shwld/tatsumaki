# CLI Release Operations

## Purpose

AI や開発者が「CLI のリリースをお願いして」という依頼を受けたときに、同じ手順で実行できるようにする。

## Command

```bash
bun run cli:release:upload -- <tag>
```

- 例: `bun run cli:release:upload -- cli-v0.0.2`

## What it does

`scripts/cli-release-upload.sh` が次を実行する。

1. タグ `cli-vX.Y.Z` から `X.Y.Z` を抽出し、CLI/Web のバージョン定義を同期
2. 変更があれば `Cargo.lock` / OpenAPI を再生成し、`git commit` + `git push`
3. Rust ターゲット追加
4. 4 ターゲットビルド（host は `cargo build`、その他は `cargo zigbuild`）
5. アセット生成（`tm-*.tar.gz` と `sha256sums.txt`）
6. Release が無ければ自動作成
7. Release assets を `--clobber` で upload

## Artifact location

- `artifacts/cli-release/<tag>/`
- `artifacts/` は `.gitignore` 対象

## Preconditions

- `gh` ログイン済み
- `cargo` / `rustup` / `zig` が利用可能
- `cargo-zigbuild` は未インストール時に自動インストール
- Public repository では `cli-v*` tag を maintainer のみが作成できるように保護する

## AI instruction template

自然文依頼を受けたら、AI は最低限以下を確認して実行する。

1. 対象タグ（例: `cli-v0.0.2`）
2. 実行コマンド

```bash
bun run cli:release:upload -- <tag>
```

## Verification

```bash
gh release view <tag>
```

以下の assets が存在すること。

- `tm-aarch64-apple-darwin.tar.gz`
- `tm-x86_64-apple-darwin.tar.gz`
- `tm-aarch64-unknown-linux-gnu.tar.gz`
- `tm-x86_64-unknown-linux-gnu.tar.gz`
- `sha256sums.txt`
- `install-tm.sh`

## End-user install command

環境差分を吸収するインストール用コマンド。

```bash
curl -fsSL https://github.com/shwld/tatsumaki/releases/latest/download/install-tm.sh | bash
```

特定バージョンを指定する場合:

```bash
curl -fsSL https://github.com/shwld/tatsumaki/releases/download/cli-v0.0.2/install-tm.sh | bash -s -- cli-v0.0.2
```
