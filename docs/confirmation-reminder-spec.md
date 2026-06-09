# 確認ボタン・未確認通知 仕様

## 目的

自動送信または手動送信したLINEメッセージに対して、ユーザーが確認ボタンを押したかを記録し、未確認のユーザーがいる場合に管理者へPush通知する。

LINEの既読状態はMessaging APIで取得できないため、本機能では「確認したよ👍」ボタンの押下を確認済みとして扱う。

## 対象

- 自動送信メッセージ
- 手動送信メッセージ
- 送信成功したユーザーのみ

送信失敗したユーザーは既存の送信履歴の失敗として扱い、未確認チェック対象にはしない。

## 確認ボタン

- 表示文言: `確認したよ👍`
- LINE Messaging APIのクイックリプライで表示する。
- 左側アイコン: `public/line/confirm-quick-reply.png`
  - 濃い緑の円、金色の縁、白いチェックマークのPNG
  - `APP_BASE_URL` またはVercelのデプロイURLからHTTPSの `imageUrl` を生成する
  - HTTPS URLを生成できない環境では、アイコンなしで送信する
- アクションはpostbackとし、`runId` と `userId` を含める。
- Webhookでpostbackを受け取ったら、該当ユーザーを確認済みに更新する。

## 最新メッセージ優先

同じユーザーに複数回送信している場合は、最後に送信したメッセージのみを未確認チェック対象とする。

- 新しい送信が成功したら、ユーザー単位の確認対象を新しい `runId` で上書きする。
- 古い送信履歴は残すが、未確認Push通知の対象にはしない。
- 古い確認ボタンが後から押された場合、古い送信履歴は確認済みに更新してよいが、最新送信の確認状態は変更しない。

## データ

### sendRuns

既存の送信履歴。`targets` に確認状態を追加する。

- `confirmationStatus`
  - `pending`: 未確認
  - `confirmed`: 確認済み
  - `reminded`: 未確認通知済み
  - `not_required`: 確認対象外
- `confirmedAt`
- `reminderSentAt`

### confirmationTargets

ユーザー単位の最新確認対象。

パス:

```text
lineAccounts/{lineAccountId}/confirmationTargets/{userId}
```

主な項目:

- `lineAccountId`
- `userId`
- `userName`
- `runId`
- `mode`
- `sentAt`
- `status`
- `confirmedAt`
- `reminderSentAt`
- `updatedAt`

## 未確認チェックCron

- Route: `/api/cron/check-unconfirmed-messages`
- Schedule: `0 4 * * *`
- JST: 13:00

13:00時点で未確認の最新確認対象をチェックする。実際の送信時刻が遅れていても、送信から6時間経過しているかは判定しない。

## Push通知

未確認対象がいる場合、管理者/閲覧者のWeb Pushへ通知する。

- 1人: `○○○さんに未確認メッセージがあります`
- 複数人: `○○○さんほかN名に未確認メッセージがあります`

通知後、対象は `reminded` に更新し、同じ送信に対する通知は繰り返さない。

未確認チェックの実行結果はCron履歴に記録する。
