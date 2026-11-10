# ADR-0014: Story Map のライブ編集を Durable Object で直列化する

## Metadata

- **status**: accepted
- **deciders**: shwld
- **date**: 2026-11-10
- **enforcement**: manual

## Context

story #393 から始まる Story Map 機能は、project ごとに複数のマップを持ち、活動 → タスク → カードを並べ、成果ごとのスライス(提供範囲)へカードを移す計画用の画面である。設計案は初回を revision による楽観ロックだけで出し、ライブ共同編集を後回しにしていた。レビューで「最初から Durable Object でライブ編集を考える」と決めた。

- 設計案: `tm artifact get --project 01KN9P32R248P2PK1413DKQQG5 01M6FFGFT43WGMRF6PAK4MXS27`
- Cloudflare Durable Objects の WebSocket Hibernation API: https://developers.cloudflare.com/durable-objects/best-practices/websockets/

Story Map は PivotalTracker にない機能である。[ADR-0002](adr-0002-pivotaltracker-ui-design.md) の Amendment(story #391)により画面の新設は ADR 不要で、既存の navigation・a11y・dark mode・i18n の規則に従う。画面が必要な理由と小さなチームの流れを重くしない点は、各 story の Plan に書く。本 ADR はアーキテクチャ上の決定だけを扱う。

既存の Durable Object `PlanningPokerDO` は WebSocket の接続者を `?userId=` で受け取り、メモリ上の接続集合で配信している。Story Map では接続者の身元を query に載せず、休止後の復帰にも耐える必要があるので、この実装は流用しない。

## Decision

### 1. 構成: マップ 1 つにつき Durable Object 1 つ

- `idFromName(mapId)` で引く SQLite バックエンドの Durable Object を **マップの全書き込みの直列化点** にする。書き込みは HTTP 経由でも WebSocket 経由でも必ず DO を通す。
- **正本は D1 のままにする。** DO の storage には正本を置かない。理由は、story の読み取りモデルとの結合、project 削除の cascade、一覧・archive、ADR-0004 の migration 運用、運用時の調査を、既存の repository 構成のまま行うため。DO は直列化・検証・配信を担い、起床時に D1 から状態を読み込む。
- D1 の呼び出しは DO の input gate で守られず、await の間に別メッセージが割り込める。DO 内で Promise キュー(mutex)を使い、1 マップの操作を 1 件ずつ処理する。
- 読み取りだけの用途(一覧、WebSocket を使わない初期表示)は D1 を直接読んでよい。

### 2. 操作モデル: サーバー権威のコマンド

CRDT は採用しない。DO が唯一の適用順序を決めるので、マージ規則は不要である。

- クライアントはコマンドを送る: `{ opId, type, args }`。`opId` はクライアントが採番する ULID で、再送時の冪等キーを兼ねる。
- コマンドは意図で表す。カード移動は座標でなく `(カード, 移動先のタスク・スライス, 直前のカード)` とし、位置は DO が適用時に計算する。
- DO は権限と不変条件(同一マップ内の参照、同一 story の 1 マップ内 1 配置、同一 project の story のみ。#394 が定義する domain の検証)を確認し、通れば適用して `seq` を 1 進める。
- 適用結果は **D1 への 1 回の atomic な batch**(操作の効果、`story_maps.seq` の更新、`opId` の記録)で永続化してから、全接続へ `{ seq, op }` を配信する。送信元には ack も返す。
- 同じ対象への同時操作は **DO への到着順で後勝ち** とする。項目単位(タイトル、メモ、スライス名)でも後勝ちで、文字単位の共同編集は行わない。移動先や対象が既に削除されていたら `target_gone` で拒否し、最新状態を返す。
- `opId` が記録済みなら再適用せず、以前の結果を返す。記録は直近 24 時間分を保持し、期限切れは削除する。
- 他の操作と競合する story 化(#398)は、story の作成とカード紐づけを DO のコマンド 1 つにまとめ、D1 の同一 batch で処理する。

### 3. 接続と同期

- WebSocket は Hibernation API(`state.acceptWebSocket`)で受け付け、`userId` と `role` は socket の attachment に保持する。DO が休止・再起動してもメモリ上の集合に依存しない。
- 接続時は snapshot(全状態 + `seq`)を送る。クライアントはコマンドを楽観的に反映し、サーバーの配信で確定・巻き戻しを行う。`seq` の欠番を検知したら snapshot を再取得する。
- 再接続したクライアントは、未 ack のコマンドを同じ `opId` で再送する。ページを再読込すると未 ack のコマンドは失われ、永続化しない。
- 切断中の編集は、再接続できる短い間だけ待つ。回復しない場合は編集を無効にし、状態を表示する。オフライン編集は扱わない。
- 配信は構造と配置の変更に限る。story の属性(状態・見積・タイトル)の変更はライブでは配信せず、snapshot・再接続・画面の再フォーカス時に読み取りモデルから取り直す。
- presence(カーソル・選択の共有)は対象外とする。

### 4. 認証・認可

- Worker の route が session 認証と project membership、`mapId` が当該 project のものであることを検証し、upgrade 後に DO へ **信頼できる内部ヘッダー** で `userId` と `role` を渡す。`userId` を query や body から受け取らない。
- WebSocket upgrade は `Origin` がアプリ自身のものであることを確認する(Cross-Site WebSocket Hijacking の防止)。
- owner / member は編集、viewer は購読のみ。書き込みコマンドは毎回 D1 で membership を確認し、除名後の編集を次の書き込みで止める。購読は DO の alarm で 5 分ごとに membership を再確認し、失効していれば socket を閉じる。この間の閲覧は受容する。
- 他 project・存在しない map への接続は、Artifact と同様に存在を漏らさない同一の拒否応答にする。API key での WebSocket 接続は初回は対象外とする。

### 5. 資源の上限

初期値を置く。実測で見直す場合は本 ADR を更新する。

- 1 メッセージ 64 KiB まで、1 socket あたり毎秒 20 コマンドまで。
- 1 マップの同時接続は 50 まで。
- 1 マップのカードは 2,000 まで(snapshot を 1 メッセージで送れる大きさに保つ)。

### 6. 採用しない案

| 案 | 採用しない理由 |
| --- | --- |
| revision による楽観ロックのみ | 並べ替え・移動の同時編集で 409 が頻発し、再適用の操作を利用者に強いる。ライブ編集の要件を満たさない |
| CRDT(Yjs 等) | 「同一 story は 1 マップ 1 配置」「同一 project の story のみ」などの不変条件をマージ後に保証できない。依存と永続形式が増える。サーバー権威なら不要 |
| DO の SQLite を正本にする | story との結合、project 削除、一覧・運用調査が D1 と二重になる。既存の repository・migration 運用から外れる |
| SSE + HTTP POST | 双方向の再接続・再送制御を自前で組むことになり、DO の直列化と相性が悪い |

## Consequences

- 同時編集が最初から成立し、衝突は到着順で決まる。同じ項目を同時に編集すると後の入力が残り、先の入力は上書きされる。
- 書き込み経路が DO に一本化されるので、#394 の domain は DO から呼べる純粋な usecase として切り出す。HTTP の書き込み API は DO へ転送する薄い層にする。
- Story Map の導入で `wrangler.toml` に DO binding と migration(新しい tag)が増える。self-hosting の `wrangler.*.toml` と setup script、テスト設定も追従する。
- D1 の書き込みがマップ内の操作ごとに発生する。1 マップ 50 接続・毎秒 20 コマンドの上限内で収まる想定で、#397 の実測(500 / 2,000 カード)で確認する。
- story の属性変更がライブで反映されないことを画面で許容する。必要になったら別 story で DO への通知経路を追加する。
- 履歴・undo・presence・オフライン編集・API key / CLI からの編集は含めない。要望が出た時点で別 story にする。
- 後続: #394(domain・永続化・権限)、#395(DO 基盤)、#396(一覧画面)、#397(編集画面)、#398(story 連携)がこの決定に従う。
