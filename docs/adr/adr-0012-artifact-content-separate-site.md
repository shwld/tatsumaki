# ADR-0012: Artifact content を別 site から配信する

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-11-06
- **supersedes**: ADR-0010 §4 の「別 origin 配信は採用しない」と、その Cloudflare Access bypass の決定（ADR-0010 の他の節は有効）
- **superseded_by**:
- **enforcement**: ci-check

## Context

ADR-0010 は、信頼できない任意の HTML/JavaScript である Artifact を `sandbox="allow-scripts"` の opaque origin で配信し、別 origin 配信は self-hosting に追加 domain を要求するため採用しなかった。ただし「main thread の tight loop が親タブを固めることが実証されたら、別 origin 方式を別 ADR で採用する」と定めていた。

story #314 の実 browser テストで、3,000ms の busy loop により親ページのタイマーが 2,995ms 遅れることを実測した（ADR-0010 の Amendment 2026-10-24）。`Origin-Agent-Cluster`、`Document-Isolation-Policy`、COEP + CORP では改善しなかった。sandbox 付き iframe が親と同じ site の process で動くためである。この条件が満たされたので、本 ADR で別 origin 方式を決める。

ADR-0011 により、公式ホスト版は自由登録になる。登録者は project を作れないが、招待された project には member として artifact を置ける。固まるのは閲覧した member 自身のタブの可用性だけでデータは露出しないが、自由登録の前に、設定漏れで分離が効かない状態を残さない。

## Decision

### 1. 構成

- content は、アプリ本体とは **別の registrable domain**（別 eTLD+1）から配信する。サブドメインは同一 site なので process が分離されず、採用しない。
- 同じ Worker を、content 用 domain にも割り当てる。Worker は `Host` で振り分ける。別 Worker は立てない（deploy・secret・R2 binding の二重管理を避ける）。
- 設定は環境変数 `ARTIFACT_CONTENT_ORIGIN`（scheme と host のみ。例 `https://content.example`）。値の検証は setup script と起動時の双方で行い、本体 origin と同一 host、または一方が他方のサブドメインである値は拒否する。
- content domain の具体名は運用で決め、ADR には書かない。content domain は他の用途に使わず、本体 domain と cookie を共有しない。

### 2. Host による振り分け

`ARTIFACT_CONTENT_ORIGIN` が設定されているとき:

- content host のリクエストは `/artifact-content/*` だけを処理し、他の path は 404 とする。認証・session・SPA fallback は通さない。
- 本体 host の `/artifact-content/*` は 404 とする。残すと、同一 site で tight loop を起こせる経路が残るため。
- preview-token 発行 API（ADR-0010 §5）は、`contentPath`（相対）に加えて絶対 URL `contentUrl` を返す。client は `contentUrl` を iframe の `src` にする。token の形式・TTL・署名鍵は変えない。

### 3. CSP・CORS・iframe

- content response の `<base>` は `${ARTIFACT_CONTENT_ORIGIN}/artifact-content/<token>/`、`frame-ancestors` は本体 origin のままとする。
- 本体 SPA の CSP `frame-src` は `${origin}/artifact-content/` から `ARTIFACT_CONTENT_ORIGIN` に差し替える（未設定時は従来のまま）。
- `Access-Control-Allow-Origin: *`（credentials なし）、`nosniff`、`Referrer-Policy: no-referrer`、`Cache-Control: private, no-store` は維持する。
- iframe の `sandbox="allow-scripts"`（`allow-same-origin` なし）と、content response の `Content-Security-Policy: sandbox allow-scripts` は維持する。別 site 化に加えた多層防御とする。

### 4. Cloudflare Access

- content domain は Access の対象外とする。bypass application は要らない。認可は capability token のみで、ADR-0010 §4 の決定は変わらない。
- `ARTIFACT_CONTENT_ORIGIN` の設定時、setup script は `/artifact-content/*` の bypass application を作らない。本体 host の同 path は 404 を返すので、既存の bypass が残っていても害はない。
- 未設定の self-hosting では、ADR-0010 の bypass application を従来どおり使う。

### 5. 未設定の環境の既定

| 環境 | `ARTIFACT_CONTENT_ORIGIN` 未設定のとき |
| --- | --- |
| self-hosting（`ENTITLEMENT_MODE` 未設定） | 現行方式（opaque origin sandbox、同一 host の `/artifact-content/*`）を継続する。追加 domain を強制しない |
| 公式ホスト版（`ENTITLEMENT_MODE=control-plane`） | **fail-closed**。preview を無効にする |

公式ホスト版の無効化は次のとおり。ADR-0011 の Turnstile と同じく、設定漏れが無保護の公開にならないようにする。

- preview-token 発行 API は、型付きのエラーコード（`ARTIFACT_PREVIEW_DISABLED`）を返す。content route は 404 とする。
- upload・list・detail・download は無効にしない（preview だけが対象）。
- Artifact 詳細（#327）は、preview の代わりに「この環境ではプレビューを利用できない」ことの説明と、download 導線を出す。表示の詳細は #327 で決める。

### 6. 検証

- `apps/web/test/artifact-sandbox` の実 browser テストを別 site 構成で実行し、artifact の無限ループ中の親ページのタイマー遅延が閾値内であることを実測で固定する。現行の測定テストは検証に変える。
- 既存の隔離テスト（parent・storage・network・popup・download・clipboard・top navigation）を別 site でも通す。
- content host へのリクエストに本体の cookie が付かないこと、content host が cookie を設定しないことをテストで固定する。
- Host 振り分けのテスト: content host で `/artifact-content/*` 以外が 404、本体 host の `/artifact-content/*` が 404、未設定時は従来どおり。
- Firefox / WebKit での process 分離は #321 の自動化で確認する。

## Alternatives considered

- **別 Worker に分ける**: deploy・secret・R2 binding が二重になる。Host 振り分けで足りる。
- **同一 site のサブドメイン**: process が分離されず、親 domain 属性の cookie も共有し得る。
- **全環境で preview を無効にする**: self-hosting の導入が重くなる。現行方式で足りる運用者には不要。
- **公式ホスト版でも現行方式を継続する**: 自由登録の後は、招待された free ユーザーが他の member のタブを固められる状態を許容する。設定漏れの検知もできない。

## Consequences

- 公式ホスト版は、別 domain（Cloudflare の zone）の用意と `ARTIFACT_CONTENT_ORIGIN` の設定が preview の前提になる。設定するまで preview は使えない。upload・download は使える。
- self-hosting は設定不要のまま。ただし未設定では tight loop の残余リスク（ADR-0010 §4）を受容し続ける。README に、公開運用ではこの設定を推奨すると書く。
- 同一 Worker が 2 host を扱うため、Host 振り分けの誤りは分離の崩れに直結する。上記のテストを CI で固定する。
- capability token は content host の URL path に入る。log での redact は従来どおり必須。
- WebKit の process 分離は保証できない。#321 の結果を残余リスクとして追記する。
- ADR-0010 は有効なまま、§4 に本 ADR への参照を追記する。
