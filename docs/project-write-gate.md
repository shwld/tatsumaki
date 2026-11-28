# プロジェクト書き込みゲート(利用制限の強制)

[ADR-0016](adr/adr-0016-entitlement-provider-boundary.md) の利用状態が利用不可のプロジェクトで書き込みを拒否する仕組みと、その適用経路の一覧。story #433、#476。

## 有効化

| 設定 | 値 | 意味 |
| --- | --- | --- |
| `ENTITLEMENT_MODE` | `control-plane` | 公式ホスト版。未設定のセルフホストは常に許可 |
| `PROJECT_WRITE_ENFORCEMENT` | `true` | 強制を有効にする。未設定は何も拒否しない |

1. staging の `wrangler` vars に `PROJECT_WRITE_ENFORCEMENT = "true"` を入れて deploy し、利用不可のプロジェクトで下の経路が 403 になること、利用できるプロジェクトで通ることを確認する。
2. 本番は公開準備(既存プロジェクトの手当てと法務表示)の後に同じ値を入れる。戻すときは値を消して deploy する。キャッシュは isolate ごとなので、最大 60 秒で切り替わる。

## 状態と操作

| 状態 | 読み取り | 書き込み | オーナーの削除 |
| --- | --- | --- | --- |
| 利用可(期限なし・期限内) | 可 | 従来のロール権限どおり | 可 |
| 利用不可(期限切れ含む) | 可 | 403 `PROJECT_SUSPENDED` | 可 |
| 状態不明(キャッシュなし・期限超過、Control Plane 障害) | 可 | 503 `ENTITLEMENT_UNAVAILABLE` | 可 |

メンバー権限・認可は先に満たす必要がある。ゲートはメンバーに対してだけ判定し、非メンバーには利用状態を見せずに従来のエラーに任せる。

## 経路

| 入口 | ガード箇所 | 備考 |
| --- | --- | --- |
| Web API `/api/projects/:projectId/**` の POST/PUT/PATCH/DELETE | `requireProjectWritable`(`index.ts` の `protectedApi`) | stories、labels、iterations、epics、saved-filters、story-maps、api-keys、artifacts、invitations、settings、planning-poker など |
| Programmatic API `/programmatic-api/v1/projects/:projectId/**` | `requireProjectWritable`(`programmaticApi`) | CLI。OAuth Bearer 経由は `McpOAuthApiHandler` 内の `cliApp` にも適用 |
| API key `/api-key/v1/projects/:projectId/**` | `requireProjectWritable`(`apiKeyV1Route`) | stories、artifact の upload・finalize・patch。upload は同じパス配下なので同じゲートを通る |
| MCP の書き込み tool | `requireProjectAccess(..., env)`(`mcp/project-access.ts`) | archive/unarchive_story、reorder_stories、create_story、update_story、update_story_status、create_story_comment、enable/disable_label_epic、update_label_epic_plan。読み取り tool は渡さない |
| Story Map の HTTP command | `requireProjectWritable` | `/projects/:projectId/story-maps/:mapId/commands` |
| Story Map のライブ接続(WebSocket) | `StoryMapDO.runCommand` | 接続後に停止された場合も、コマンドごとに判定する。reject code は `suspended` / `entitlement_unavailable` |
| Planning poker | `requireProjectWritable` | POST は上のパス配下。DO には HTTP 経由でだけ届く |

## 例外(ゲートの対象外)

- `DELETE /projects/:projectId`(オーナーの削除)。ルート側でオーナーを確認する。
- `POST /projects`、`/project-creation-requests`(作成。権利が得られた後に別経路で行う)。
- `POST /invitation-links/accept`(パスにプロジェクト ID がない参加。メンバーを増やすのは編集にあたらないが、必要になれば受諾時に判定する)。
- `/auth/me/**`(個人設定)、`POST /usage/account-operations/manage`、`POST /usage/projects/:projectId/operations/:operation`、onboarding。
- メンバー本人の脱退: 現在そのルートは存在しない。追加するときはこの一覧に加え、ゲートから除外する。
- 読み取り(GET/HEAD/OPTIONS、および MCP の読み取り tool)。

## 新しい書き込み経路を足すとき

`/projects/:projectId/` 配下に置けば自動でゲートを通る。パスにプロジェクト ID を持たない経路や、MCP tool、Durable Object の直接入口を足すときは、`decideProjectWrite` を明示的に呼び、この表に行を足す。

## エクスポート(story #434)

[ADR-0015](adr/adr-0015-project-scoped-billing.md) は、エクスポートを全状態でオーナーのみ、利用不可では全員不可とする。

### 棚卸し結果

プロジェクトデータを一括で取り出す入口(CSV/JSON/一括ダウンロード、生成済み成果物・保存済みリンク)は現状存在しない。確認した近い経路は次のとおりで、いずれもエクスポートではなく閲覧の一部として扱い、制限しない。

- ストーリー添付の取得(`stories.ts` の attachment content、`?download=1` を含む)。個別ファイルの閲覧。
- アーティファクトの配信(`artifacts/routes.ts`)。個別成果物の閲覧。
- GET の読み取り API 全般。

### 新しいエクスポート入口を足すとき

メンバーの role を取得したうえで `decideProjectExport(bindings, projectId, role)`(`project-write-guard.ts`)を呼び、null でなければ `denial.status` / `denial.body` を返す。ロールは先に判定するので、非オーナーには利用状態が見えない。判定は書き込みと同じキャッシュ・fail closed(503)を使う。#130 のような汎用入出力は別 story。

### 本番有効化の前提

停止中のエクスポート拒否は `PROJECT_WRITE_ENFORCEMENT` と同じスイッチで有効になる。本番では、公開準備 H で利用規約・プライバシーポリシーに「停止中はエクスポート不可、本人の開示・消去請求は運営者が個別対応」と明記してから有効化する。

## 画面の表示と読み取り専用(story #435)

`GET /api/projects/:projectId/usage` が同じキャッシュから `available` / `limited` / `read_only` / `unknown` を返す。期限(`limited`)はオーナーにだけ返し、他のメンバーには `available` を返す。クライアントの `ProjectUsageScope` が開いているプロジェクトの状態を 60 秒ごと・タブ復帰時に取り直し、`read_only` と `unknown` では `useProjectReadOnly()` が true になる。

- ストーリー作成・編集・並べ替え、ラベル・Story Map の編集入口はこのフックで無効にする。新しい編集入口を足すときも使う。
- 状態を読めないときは利用できるとみなさず、書き込み不可と再試行を出す。閲覧は続く。

## 利用者の操作(story #476)

| 経路 | 内容 |
| --- | --- |
| `GET /usage/operations?locale=` | 所有プロジェクトの利用状態、使える操作、案内。操作を取得できないときは `operationsAvailable: false` で状態だけを返し、画面はボタンを出さない |
| `POST /usage/projects/:projectId/operations/:operation` | オーナーを確認し、操作の移動先(HTTPS)を返す。非オーナー 403、非メンバー 404、提供者の拒否・障害 503 |
| `POST /usage/account-operations/manage` | 利用者自身の管理画面の移動先を返す |

- 操作できる対象かは Control Plane が呼び出し元の権利から判定し直す。移動先はログに出さない。
- 利用の再開(`resume`)の可否は提供者の一覧に従う。削除要求の受付後は 409 `project_deleting`。`requestId` は projectId と UTC 日付から決める。
- `resume` の戻り先は `/projects/:projectId?operation=resume`(キャンセルは `resume-cancel`)。戻り URL だけでは権利を与えず、バナーが利用状態を再取得して利用できるまで読み取り専用のまま待つ(5 秒間隔で最大 2 分、その後は再読み込みを案内)。

`/usage/projects/:projectId/**`(利用者の操作・所有権の譲渡申請・受け手の権利の取得)は `/projects/:id` 配下ではないため、ゲートは対象外にする。利用不可でも利用の再開と申請の取消・辞退ができる。
