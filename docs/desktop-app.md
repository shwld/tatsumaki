# Desktop App (Story 244 / 284)

## 目的

`apps/web` をホスト済み URL で表示する viewer として提供する。加えて、CLI から実行中 viewer へ再取得を通知する desktop IPC と、macOS 向けに配布可能な `.app` / `.dmg` を生成し、GitHub Release へ配布物を公開できる状態を維持する。

## 構成

- `apps/desktop/src/main.ts`
  - host window: tatsumaki のホスト URL を全面表示
  - settings window: viewer URL 設定のみ
- `apps/desktop/src/config-store.ts`
  - URL 永続化（`app.getPath("userData")/desktop-config.json`）
  - `https` 以外を拒否
- `apps/desktop/src/desktop-ipc.ts`
  - desktop IPC サーバ（`node:net`）
  - protocol version / requestId / allowlist (`refetch:stories`, `refetch:screen`)
  - Unix domain socket（macOS/Linux）と named pipe（Windows）を統一インターフェースで吸収
- `apps/desktop/forge.config.cjs`
  - `appBundleId`: `app.shwld.tatsumaki.desktop`
  - `makers`: `@electron-forge/maker-zip`（darwin）/ `@electron-forge/maker-dmg`（darwin）
  - `osxSign` / `osxNotarize` を環境変数で有効化
- `apps/desktop/assets/icon.icns`
  - macOS 配布用アイコン

## Viewer 方針

- Desktop は tatsumaki viewer を表示する thin shell とする
- Prompt 実行、CLI ジョブ起動/停止/監視、viewer DOM への AI 操作用 UI 注入は持たない
- URL 変更は `File > Settings...` の settings window から行う
- `tm desktop refetch` 用の desktop IPC は viewer 再取得通知として維持する

## 実行

```bash
bun install --cwd apps/desktop
bun run --cwd apps/desktop build
bun run --cwd apps/desktop dev
```

## macOS 配布ビルド

```bash
bun run --cwd apps/desktop icon:mac
bun run --cwd apps/desktop make:mac
```

生成物は主に以下。

- `.app`: `apps/desktop/out/tatsumaki-desktop-darwin-*/tatsumaki Desktop.app`
- `.dmg`: `apps/desktop/out/make/*.dmg`
- `.zip`: `apps/desktop/out/make/zip/darwin/*/*.zip`

## Desktop Release workflow（手動実行のみ）

`Desktop Release` は `workflow_dispatch` 専用。`main` push では実行しない。
Public repository では Apple signing secrets を GitHub Environment などで保護し、maintainer 承認なしに release workflow を実行できない状態を維持する。

必須入力:

- `tag`: `desktop-vX.Y.Z` 形式

実行ルール:

- `tag` の `X.Y.Z` と `apps/desktop/package.json` の `version` が一致しない場合は fail-fast
- 署名・公証・dmg 生成は macOS runner
- `.dmg` は別途 `notarytool submit` 後に `stapler staple` してから検証
- Release 作成・asset アップロードは Linux runner

Release に添付される成果物:

- `*.dmg`
- `*.zip`
- `sha256sums.txt`

## 署名・公証（CI 中心）

CI の `Desktop Release` では次の Secrets を使う。

- `DESKTOP_APPLE_SIGN_IDENTITY`
- `DESKTOP_APPLE_API_KEY_ID`
- `DESKTOP_APPLE_API_ISSUER`
- `DESKTOP_APPLE_API_KEY_CONTENT`（`.p8` 内容）
- `DESKTOP_APPLE_CERT_P12_BASE64`（Developer ID Application 証明書 `.p12` の base64）
- `DESKTOP_APPLE_CERT_P12_PASSWORD`（`.p12` エクスポート時パスワード）
- `DESKTOP_APPLE_KEYCHAIN_PASSWORD`（CI 一時 keychain のパスワード）

ジョブは `DESKTOP_MAC_SIGN_REQUIRED=true` で動作するため、上記が不足すると fail-fast で停止する。

ローカルでは未設定でも `make:mac` を実行可能（非署名ビルド）。

## 署名・公証失敗時の切り分け

1. `DESKTOP_MAC_SIGN_REQUIRED=true` なのに `APPLE_SIGN_IDENTITY` が空でないか確認する。
2. `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH` がすべて存在するか確認する。
3. macOS runner 上で `xcrun notarytool` が利用可能か確認する。
4. 失敗ログで `codesign` と `notarytool` のどちらで落ちたかを分離して再実行する。

## 配布物検証（必須）

```bash
bun run --cwd apps/desktop verify:mac
```

`verify:mac` は次を実行する。

- `spctl -a -vv <.app>`（Gatekeeper 評価）
- `stapler validate <.app>`
- `stapler validate <.dmg>`

加えて、手動で `.app` を起動し、初回起動時に Gatekeeper で拒否されないことを確認する。

## セキュリティ方針（初回）

- 設定 URL は `https` のみ許可
- host window の外部遷移を制限（同一 origin のみ許可）
- 許可外 URL は新規ウィンドウ遷移せず `shell.openExternal` へ委譲
- desktop IPC は allowlist message のみ受け付け、未知 message は `UNKNOWN_MESSAGE_TYPE` で拒否

## Desktop CLI IPC（Story 257）

### Request envelope

```json
{
  "version": 1,
  "requestId": "req-...",
  "authToken": "<desktopIpcAuthToken>",
  "type": "refetch:stories",
  "payload": {
    "projectId": "..."
  }
}
```

### Response envelope

```json
{
  "requestId": "req-...",
  "ok": true
}
```

失敗時:

```json
{
  "requestId": "req-...",
  "ok": false,
  "errorCode": "UNAUTHORIZED",
  "message": "invalid IPC auth token"
}
```

### Endpoint rules

- dev override: `TATSUMAKI_DESKTOP_IPC_ENDPOINT`
- auth token override: `TATSUMAKI_DESKTOP_IPC_AUTH_TOKEN`
- Windows: `\\\\.\\pipe\\tatsumaki-desktop-<user>`
- macOS/Linux: `$XDG_RUNTIME_DIR/tatsumaki-desktop-ipc.sock`（未設定時は `app.getPath("userData")` 配下）
- macOS/Linux では socket permission `0600` を設定し、同一ユーザー以外の接続を拒否

### Message semantics

- `refetch:stories`: story/panel query を再取得
- `refetch:screen`: bootstrap + story/panel query を再取得
