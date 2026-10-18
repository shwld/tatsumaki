# ADR-0010: Project Artifacts — Trust Boundary, Version Model, Upload Protocol and Content Serving

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-10-11
- **enforcement**: ci-check

## Context

story #302 は、CLI で登録した build 済み directory を project 配下の Artifact として保存し、Web で実行可能な画面として閲覧できるようにする。Artifact は **信頼できない任意の HTML/JavaScript** であり、tatsumaki の認証済み origin 上で実行されると session 乗っ取り・API 呼び出しが可能になる。そのため実装前に threat model と境界方式を決める必要がある（story の要件）。

また Artifact 一覧・詳細は Pivotal Tracker に対応画面がなく、ADR-0002 の Screen creation gate に抵触する。

## Decision

### 1. ADR-0002 の限定例外

`/projects/:projectId/artifacts` 系 3 route（一覧 / latest / version 固定）に限り、Pivotal Tracker に対応画面がなくても新設を許可する。変更は Artifact 画面に限定し、story panel には Artifact UI を混在させない。navigation・a11y・dark mode・i18n は既存規則に従う。ADR-0002 本文は変更せず、本 ADR を参照する。

### 2. Threat model

| 脅威 | 対策 |
| --- | --- |
| Artifact JS が parent DOM / cookie / storage / API にアクセス | opaque origin 化（§4）。session credential を Artifact に渡さない |
| 外部通信・データ持ち出し | CSP で subresource / fetch / form を制限する。**iframe 自身の navigation（`location=`、meta refresh）と、iframe 内に描画した偽フォームによるフィッシングは防げないため受容する**。iframe 周辺に「信頼されていないコンテンツ」を常時表示して緩和する。持ち出し可能なのは当該 version の内容と、利用者が iframe 内に入力した値に限る |
| content URL を直接 tab で開き sandbox 外実行 | content response に `Content-Security-Policy: sandbox allow-scripts` を付与（enforce。Report-Only は不可）し、test で固定する |
| 本体 app への script 差し込み（`<script src="/artifact-content/...">`） | content route は `Sec-Fetch-Dest` が `iframe` / `document` 以外の request を拒否し、`Cross-Origin-Resource-Policy` は付けない。本体 app の CSP `script-src` は build asset パスに限定し `/artifact-content/` を含めない |
| Artifact から tatsumaki の `/api/...` への認証付き GET | Artifact CSP の source は `'self'` を使わず `https://<origin>/artifact-content/<token>/` の path 付きに限定する。session cookie は `HttpOnly; Secure; SameSite=Lax` 以上を必須とし、test で固定する |
| capability token の漏洩・replay | 短命・version 固定・read-only・署名検証（§5）。path に入るため log で redact する |
| path traversal / 別 version・別 project 参照 | 単一の canonicalize 関数（§6）。R2 key は request path から組み立てず、D1 manifest の sha256 から導出する |
| MIME confusion / XSS | Content-Type は拡張子 allowlist から server が決定し、client 申告値は無視する。text 系は `charset=utf-8`。PDF・XML/XHTML・XSLT は allowlist に含めない。`nosniff` |
| 秘密情報の誤 upload | CLI が config guard 同等以上の規則で拒否し、server も再検証（失敗は全体失敗） |
| 巨大 / 大量 file による資源枯渇 | 50 MiB / 25 MiB / 1,000 files / path 長 512 byte を CLI・server 双方で検証。upload session に期限 |
| main thread block（tight loop） | §4 の残余リスクとして受容し、実証されたら別 origin へ移行 |
| upload session の IDOR | PUT / finalize は `session.project_id = :projectId` かつ `session.created_by = caller` を検証し、不一致は 404 |
| 非 member への存在漏洩 | 非 member は 404。既存 `requireProjectMembership` は 403 のため **Artifact 専用 guard** を作る（既存 guard を流用しない） |

親 window は Artifact iframe からの `message` を処理しない（listener を置く場合は `event.source` 照合と `origin === "null"` の拒否を必須とする）。

### 3. Version model と D1 スキーマ（概要）

- `artifacts(id ULID, project_id → projects ON DELETE CASCADE, title, archived_at, latest_version NULL, created_by, created_at, updated_at)`
- `artifact_versions(artifact_id, version INTEGER, entrypoint, tree_digest, file_count, total_bytes, created_by, created_at)` — PK `(artifact_id, version)`。**latest と同一 digest の場合のみ no-op**（過去版と同一内容への巻き戻しは新 version として許可する）
- `artifact_files(artifact_id, version, path, size, sha256, content_type)` — PK `(artifact_id, version, path)`、`(artifact_id, version)` への複合 FK
- `artifact_upload_sessions(id ULID, project_id, artifact_id NULL, base_version NULL, tree_digest, manifest_json, status, idempotency_key, expires_at, created_by)` — `UNIQUE(project_id, created_by, idempotency_key)`、idempotency は session 作成 POST の `Idempotency-Key` が担う（同一 key で本文 hash が異なれば 422）。finalize の冪等性は session id と status で担保する
- `artifact_upload_session_files(session_id, path, uploaded_at)` — PUT 時に記録
- `created_by` の user 削除時の挙動は既存 migration（0045 / 0047）の方針に合わせる。project 削除は cascade とし、R2 残骸は §6 の cleanup 対象に含める
- version は自動削除しない。title 変更・archive/unarchive は `artifacts` 行のみ更新し version を増やさない
- migration は ADR-0004 に従い新規ファイルで追加する

### 4. Execution sandbox と content serving

**採用: opaque origin sandbox（別 origin 配信は採用しない）**

- Web は `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" src="/artifact-content/:token/<entrypoint>">` で表示する。`allow-same-origin` は併用しない（lint/test で固定）。
- content route は **すべての response** に以下を付与する。
  - `Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src <base> 'unsafe-inline'; style-src <base> 'unsafe-inline'; img-src <base> data:; font-src <base>; media-src <base>; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'; worker-src 'none'; frame-ancestors <tatsumaki origin>`（`<base>` = `https://<origin>/artifact-content/<token>/`）
  - `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、全 feature 無効の `Permissions-Policy`、`Cache-Control: private, no-store`
  - module script / font は opaque origin から `Origin: null` の CORS request になるため `Access-Control-Allow-Origin: *`（credentials なし）を付与する
- Artifact 内の SPA は hash routing 前提とする（opaque origin では `history.pushState` と storage が使えない）。同梱 JSON の `fetch` は `connect-src 'none'` により不可。この制約は CLI help と利用例に記載する。
- 相対 URL は token path 配下で解決される。content route は cookie を読まない。
- 実 browser で CSP の path 付き source・CORS・module script が動くことを DoD の browser test で検証する。成立しない場合は別 origin 方式へ切り替える（本 ADR を supersede）。

**別 origin を採用しない理由**: self-hosting で追加の custom domain / DNS / 証明書が必須になり、setup 難度が上がる。

**残余リスク（受容）**: main thread の tight loop が sandboxed iframe と同一 process で親 tab を固める可能性がある。実証された場合は別 origin 方式を別 ADR で採用する。

**Cloudflare Access（決定）**: `apps/web/scripts/cloudflare-setup.ts` は Worker のホスト名全体を Access で保護している。opaque origin の iframe からの subresource request は cross-site となり `CF_Authorization` cookie が送られない可能性が高い。content route を token のみで認可するため、`/artifact-content/*` を Access の bypass 対象とし、setup script が bypass application を作成する方針を **採用する**（2026-10-11 deciders 承認）。bypass 後の認可は capability token のみとなる。route は `protectedApi` と SPA fallback（`devAuth` / `requireAccessAuth` / `requireAppEntitlement`）の外、かつ SPA fallback より前に mount する。

### 5. Capability token

- `POST /api/projects/:projectId/artifacts/:artifactId/versions/:version/preview-token`（**session 認証のみ**、API key では発行不可。Artifact 専用 guard で member/viewer 検証）が発行する。
- 形式: `v1.<kid>.<base64url(payload)>.<mac>`。payload は `{purpose:"artifact-content", projectId, artifactId, version, exp}`、HMAC-SHA256、`crypto.subtle.verify` で定数時間検証。`kid` により鍵 rotation（旧鍵を TTL の間受理）に対応する。TTL は 10 分。
- 無効・期限切れ・manifest 不一致・archived 以外の存在しない version はすべて同一の 404 を返す。
- HMAC 実装は `application/services/api-key-hasher.ts` と同様に application/services に置き、鍵（`ARTIFACT_CONTENT_SIGNING_KEY`、Worker secret）は presentation から注入する。
- content route の log 出力では path 中の token を redact する。
- 受容事項: member の除名・archive 後も最大 10 分は読める。archived な Artifact の content は member が既知 URL で閲覧できる要件のため配信する。
- TTL 切れ後は iframe を再読み込みして新 token を取得する（自動 refresh はしない）。latest URL は token 発行時点の latest version を token に固定する。

### 6. Upload protocol と atomic publish

**path 正規化**: percent-decode、NFC 正規化、`\` / NUL / 制御文字 / 先頭 `/` / 空 segment / `.` / `..` の拒否、大文字小文字のみが異なる重複の拒否を 1 つの関数で行い、CLI と server が同じ規則を共有し、upload と配信の双方で使う。

1. `POST .../artifact-uploads`（`Idempotency-Key` 必須）: manifest（path, size, sha256）、tree digest、base version（update 時）を送る。server は limits・path・sensitive file・MIME allowlist を検証する。評価順は **(a) 検証 → (b) 認可 → (c) base_version 不一致なら 409 → (d) latest と同一 digest なら no-op として既存 latest を返す**。no-op のときは session を作らない。
2. `PUT .../artifact-uploads/:sessionId/files/*path`: size と sha256 を server で再計算して manifest と照合し、**最終 key** `artifacts/{project}/{artifact}/blobs/{sha256}` に直接 put する（content-addressed のため上書きは同一内容）。完了は `artifact_upload_session_files` に記録する。version 間の重複は自然に排除される。
3. `POST .../artifact-uploads/:sessionId/finalize`: R2 を走査せず、D1 上の記録済み file 数と manifest の照合だけで確認する。`DB.batch()` で次を **atomic** に実行する。D1 は文がエラーになったときだけ batch 全体をロールバックし、「更新 0 行」はエラーにならないため、競合は **一意制約違反で検出する**。
   - 新規は `artifacts` を INSERT、update は `artifact_versions` へ `version = base_version + 1` を最初に INSERT（PK 違反なら全体ロールバック）
   - `artifact_files` は `INSERT ... SELECT ... FROM artifact_upload_sessions s, json_each(s.manifest_json)` の 1 文で作成する（query 数上限対策。`manifest_json` は D1 行サイズ上限を考慮して path 長・file 数で上限を制御する）
   - 後続文はすべて同一 guard 条件付きとし、`artifacts.latest_version` 更新と session `published` 化を行う。既存の `acceptSingleUseInvitation`（`d1-project-repository.ts`）の guard + `meta.changes` パターンに合わせる
4. **R2 の copy は行わない。** publish は D1 のみで完了し、content route は D1 manifest の sha256 から key を導出する。
5. cleanup: 既存 cron（`0 * * * *`）から、期限切れ・未 finalize session と、どの `artifact_files` からも参照されない blob を削除する。猶予期間（session の `expires_at` + 1 時間）を設け、publish 済み manifest から参照される key は削除しない。cleanup は application usecase（`ArtifactObjectStore` port 経由）とし `presentation/scheduled/` から呼び、既存の iteration 処理と失敗を独立させる。project 削除時の R2 残骸も対象に含める。
6. draft / 未 publish session は list / detail / content route から到達不可。

R2 へのアクセスは集約ごとの port `application/ports/artifact-object-store.ts`（put/get/delete + cleanup 用 list）経由のみとし、adapter は `infrastructure/storage/{r2,in-memory}-artifact-object-store.ts`、key 導出関数は 1 箇所に置く。bucket binding は `ARTIFACTS`（`tatsumaki-artifacts`）を新設する。

### 7. 認可

- owner/member: create・update・archive・unarchive・download。viewer: Web 閲覧と get・list・versions・download。非 member: 404（専用 guard）。
- API key scope に `artifact:read` / `artifact:write` を追加する。既存 `requireApiKeyScope` は完全一致で、`story:write` は `story:read` を包含しない。包含規則は導入せず既存の完全一致モデルを維持し、key 作成時に両 scope を付与する（2026-10-11 deciders 承認）。scope 一覧の文言は `API_KEY_SCOPES` から導出する。
- 既存 API key に artifact scope は自動付与しない。
- **API 経路**: CLI が story で既に使用している `/programmatic-api/v1/projects/{projectId}/artifacts...` に載せ、`cli-openapi.ts` へ追加する。OAuth 経路は scope で絞れず role 判定のみ、API key 経路は `artifact:read` / `artifact:write` を完全一致で要求する。Web UI 用の一覧・詳細・preview-token は `/api` の session 経路とする。

### 8. Self-hosting

README の R2 bucket 記述、setup script（3 つ目の bucket、`ARTIFACT_CONTENT_SIGNING_KEY` の生成と `secret bulk` への追加、Access bypass）、`wrangler.toml` / `wrangler.deploy.toml` / `wrangler.dev.toml` / `wrangler.test.toml` を更新する。

## Consequences

### 良い点

- self-hosting に追加 domain を要求せず、Worker + D1 + R2 で完結する
- content response 自体が sandbox を強制するため、content URL の直接 access でも sandbox 外実行にならない
- D1 を正本とする publish により、中断・再送で partial / 重複 version が生じない

### 注意点

- 隔離の強さは browser の opaque origin / CSP 実装に依存する。browser security test を DoD の必須として維持する（`allow-same-origin` 不在、parent/cookie/storage/network/popup/download 等の拒否）
- main thread block は完全には防げない。実証された場合は別 origin 方式へ移行する別 ADR が必要
- token は TTL 内の bearer であり、漏洩時は期限まで当該 version を読める
- storage 容量は無期限保持のため単調増加する（quota・purge は out of scope）
- Access bypass を採る場合、`/artifact-content/*` の認可は capability token のみになる
- `ARTIFACTS` bucket と signing key の追加で self-hosting 手順・`wrangler*.toml` の更新が必要

## Amendments

### 2026-10-18 (story #310)

- `artifact_upload_sessions.artifact_id` は `NOT NULL` とし、新規作成でも session 作成時に server が ULID を採番する。blob key（§6）が `artifact` を含み PUT が finalize 前に行われるため。`artifacts` への FK は張らない（行は finalize で INSERT される）。新規か更新かは `base_version IS NULL` で区別する。孤立 session は project 削除の cascade と §6 の cleanup で回収する。
- `artifact_upload_sessions.request_hash`（`NOT NULL`）を追加する。client 指定の artifact_id（新規は空）・base_version・tree_digest の sha256 とし、同一 `Idempotency-Key` で値が異なれば 422 とする。`status` は `pending | published | expired` の CHECK、`expires_at` / `manifest_json` は `NOT NULL`。同一 key の既存 session は status を問わずそのまま返す。
- `created_by` は users への FK を張らず、`story_attachments.uploaded_by` と同じ監査用途として user 削除後も残す。`artifact_upload_sessions.created_by` は IDOR 照合に使うが、未使用 session は期限切れ cleanup で消えるため user 削除後に残っても無害。delete-account の cascade 契約は変更しない。

## References

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/r2/platform/limits/
- https://developers.cloudflare.com/workers/examples/security-headers/
