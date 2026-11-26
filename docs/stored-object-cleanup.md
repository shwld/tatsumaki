# 削除したデータの R2 オブジェクト回収

story #467。1 時間ごとの scheduled が、D1 から参照されなくなったオブジェクトを消す。削除の操作は D1 の行を消すだけで、R2 はこの回収が消す。

| 対象 | 残す条件 |
| --- | --- |
| `story-attachments/` | `story_attachments.file_key` が一致する行がある |
| `user-avatars/` | その user の行があり `avatar_url` が NULL でない |
| `artifacts/` | プロジェクトの行がある(期限切れの upload session は別途回収) |

上の prefix の外にあるオブジェクトは消さない。参照を D1 で確認できないときは何も消さず、次回やり直す。

## 保存期間

削除してから R2 から消えるまでの上限(回収が成功している場合):

- 添付・アイコン: upload からの猶予 1 時間 + `ceil(prefix 内の全オブジェクト数 ÷ 3,000)` 時間。1 回に調べるのは prefix ごとに 3,000 件で、残すオブジェクトも数える。前回の続きから調べ、末尾の次は先頭に戻る。
- アーティファクト: 次回の実行から。1 回に調べるのは先頭から 3,000 プロジェクト分、消すのは 2,000 件まで。走査位置を保存しないため、R2 上のプロジェクトが 3,000 を超える場合は上限を保証できない。

R2 以外に残るもの:

- アイコンは削除の直後から配信しない。取得済みのブラウザには最大 1 時間キャッシュが残る(`cache-control: private, max-age=3600`)。
- D1 の削除済みの行は [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) の保持期間内は復元できる(Workers Paid は 30 日、Free は 7 日)。

## アカウントを削除しても残るもの

共有データとしてプロジェクトに残る。個別の消去請求は運営者が対応する。

- 本人が他のメンバーと共有するプロジェクトに上げた添付(ファイル名、内容、`uploaded_by`)とアーティファクト
- コメントや履歴に記録された表示名

## 運用

- 失敗はログの `Object sweep finished with errors` と `Artifact cleanup finished with errors` で確認する。同じ scope で続く場合、走査はそこから先へ進まず、保存期間の上限を超える。
- bucket は環境ごとに専有する。別の D1 を参照する Worker と共有すると、相手の参照するオブジェクトを消す。remote の bucket とローカルの D1 を組み合わせて cron を実行しない。
- D1 を過去の時点に復元する・差し替えるときは、先に cron trigger を止める。復元後の D1 に行が無いオブジェクトは消え、元に戻せない。
- 親テーブルを作り直す migration は、D1 では子テーブルの行を [cascade で消す](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)。添付の行が消えると実体も回収されるので、適用前後で行数を確認する。

## この回収を初めてデプロイする前

migration 0038 / 0042 は `stories` を作り直している。適用前に添付があった DB では、行が消えて実体だけが残っている可能性がある。R2 の `story-attachments/` の一覧(prefix を除いた値)と次の結果を突き合わせ、行の無いオブジェクトを消してよいことを確認する。

```sql
SELECT file_key FROM story_attachments ORDER BY file_key;
```
