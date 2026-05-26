# LINE Message Viewer 詳細設計

## 1. 目的

LINE公式アカウントに通知されたテキストメッセージをWebアプリで閲覧できるようにする。

個人グループでの利用を主目的とし、商用利用や大規模運用は初回リリースの対象外とする。

## 2. 確定方針

| 項目 | 方針 |
| --- | --- |
| 対象LINEアカウント | LINE公式アカウント |
| 初回のLINEアカウント数 | 1アカウント固定 |
| 将来のLINEアカウント追加 | 考慮する |
| 対象トーク | 1対1トーク、グループトーク |
| 初回対象メッセージ | テキストのみ |
| Webhook | LINE Messaging API |
| Webアプリ | Vercel上のNext.js想定 |
| データ保存 | Firestore |
| 閲覧認証 | 共有ID + パスワード |
| 閲覧セッション | サーバーCookie方式 |
| 管理認証 | 管理者ID + パスワード |
| Cookie有効期限 | 24時間 |
| パスワードハッシュ | `pbkdf2:sha256:<iterations>:<salt>:<hash>` |
| LINE秘匿情報の初回保存 | Vercel Environment Variables |
| LINE秘匿情報の将来保存 | 暗号化してFirestore保存 |
| 自動削除 | Vercel Cron + 通常のFirestore delete |
| Firestore TTL | 使用しない |
| Firebase Scheduled Functions | 初回は使用しない |
| グループ名取得失敗時 | `ユーザグループ` |
| 取消メッセージ | Webアプリ側から削除 |
| 更新方式 | 30秒ごとの再取得 + 手動更新 |

## 3. 初回リリース範囲

### 3.1 対象

- LINE公式アカウント1つを対象にする。
- 対象LINE公式アカウントへの1対1トークを保存する。
- 対象LINE公式アカウントが参加しているグループトークを保存する。
- テキストメッセージのみ保存・表示する。
- 共有ID/パスワードで閲覧画面へログインできる。
- 管理者ID/パスワードで管理画面へログインできる。
- 管理者は保存期間、共有ID、共有パスワード、メッセージ削除を管理できる。
- 保存期間を超えたメッセージは原則として一覧/APIで非表示にする。
- ただし、履歴が少ない状態で空表示になることを避けるため、直近1000件は保存期間を超えていても表示対象に残す。
- Vercel Cronで、直近1000件に含まれない期限切れメッセージを通常削除する。

### 3.2 対象外

- 画像、動画、音声、ファイル、スタンプ、位置情報の保存。
- LINE公式アカウントの管理画面からの追加登録。
- 複数共有IDの発行。
- ユーザー個別アカウント登録。
- メッセージへの返信機能。
- 検索、タグ、既読管理。
- CSV出力。
- Firestore TTL。
- Google Secret Manager。

## 4. 全体構成

```text
LINE公式アカウント
  -> LINE Messaging API Webhook
  -> Vercel Route Handler
  -> LineCredentialProvider
  -> Firestore
  -> Web閲覧画面

Vercel Cron
  -> 削除API
  -> Firestore通常削除

管理者
  -> 管理画面
  -> Firestore設定更新
```

## 5. LINEアカウントと秘匿情報管理

### 5.1 設計方針

初回は1アカウント固定のため、LINEチャネルの秘匿情報はVercel Environment Variablesに保存する。

ただし、将来の複数アカウント追加を考慮し、実装ではLINEチャネル情報の取得処理を直接 `process.env` に依存させない。

以下の責務を持つ取得層を用意する。

```text
LineCredentialProvider
  - lineAccountId から channelSecret を取得する
  - lineAccountId から channelAccessToken を取得する
  - 取得元が env か encryptedFirestore かを隠蔽する
```

### 5.2 初回MVPの保存方式

Vercel Environment Variables:

```env
LINE_DEFAULT_ACCOUNT_ID=default
LINE_CHANNEL_ID=<line-channel-id>
LINE_CHANNEL_SECRET=<line-channel-secret>
LINE_CHANNEL_ACCESS_TOKEN=<line-channel-access-token>
```

Firestore:

```text
lineAccounts/default
  lineAccountId: "default"
  displayName: "<LINE公式アカウント表示名>"
  credentialProvider: "env"
  channelId: "<line-channel-id>"
  channelSecretRef: "LINE_CHANNEL_SECRET"
  channelAccessTokenRef: "LINE_CHANNEL_ACCESS_TOKEN"
  retentionDays: 90
  viewerSharedId: "<任意文字列>"
  viewerPasswordHash: "<pbkdf2 hash>"
  status: "active"
  createdAt
  updatedAt
```

Firestoreには `channelSecret` と `channelAccessToken` の平文を保存しない。

### 5.3 将来の複数アカウント対応

管理画面からLINE公式アカウントを追加する場合は、Vercel Environment Variablesではなく、暗号化した秘匿情報をFirestoreに保存する。

将来用Firestore例:

```text
lineAccounts/{lineAccountId}
  lineAccountId
  displayName
  credentialProvider: "encryptedFirestore"
  channelId
  retentionDays
  viewerSharedId
  viewerPasswordHash
  status
  createdAt
  updatedAt

lineAccounts/{lineAccountId}/credentials/current
  encryptedChannelSecret
  encryptedChannelAccessToken
  encryptionKeyVersion
  createdAt
  updatedAt
```

将来用Vercel Environment Variables:

```env
APP_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
APP_ENCRYPTION_KEY_VERSION=v1
```

暗号化方式の候補:

```text
AES-256-GCM
```

保存値:

```text
encrypted value = base64(iv).base64(ciphertext).base64(authTag)
```

注意:

- Firestoreには平文を保存しない。
- 復号キーはVercel Environment Variablesに保存する。
- `APP_ENCRYPTION_KEY` とFirestoreの両方が漏えいした場合は復号され得る。
- Secret Managerより防御層は薄いが、無料枠運用と管理画面追加の両立を優先する。

### 5.4 Webhook URL

複数アカウント対応に備え、初回からURLに `lineAccountId` を含める。

```text
POST /api/line/webhook/{lineAccountId}
```

初回例:

```text
POST /api/line/webhook/default
```

理由:

- Webhook署名検証には対象チャネルの `channelSecret` が必要。
- 署名検証前に対象アカウントを特定する必要がある。
- 将来、LINE公式アカウントごとにWebhook URLを分けられる。

## 6. 認証・セッション設計

### 6.1 共通方針

Firebase Authは使わず、初回はサーバーCookie方式を採用する。

理由:

- 閲覧者は個人メールや個別アカウント登録なしで利用する。
- 共有IDが任意文字列であり、Firebase Authのメール/パスワード方式と相性が悪い。
- Firestoreをクライアントから直接読ませず、Route Handler経由にすることで認可を一元化する。

### 6.2 Cookie仕様

```text
httpOnly: true
secure: production only true
sameSite: "lax"
path: "/"
maxAge: 24h
```

Cookie値:

```text
base64url(JSON payload).base64url(HMAC-SHA256 signature)
```

署名:

```text
SESSION_SECRET を使った HMAC-SHA256
```

### 6.3 閲覧者セッション

Payload:

```json
{
  "role": "viewer",
  "lineAccountId": "default",
  "exp": 1770000000
}
```

閲覧者に許可する操作:

- メッセージ一覧取得。
- メッセージ詳細取得。
- ログアウト。

閲覧者に許可しない操作:

- メッセージ削除。
- 保存期間変更。
- 共有ID/パスワード変更。
- LINEアカウント設定変更。

### 6.4 管理者セッション

Payload:

```json
{
  "role": "admin",
  "exp": 1770000000
}
```

管理者に許可する操作:

- 管理画面閲覧。
- 保存期間変更。
- 共有ID/パスワード変更。
- メッセージ手動削除。
- 自動削除ログ確認。
- 将来のLINEアカウント追加。

### 6.5 管理者ID/パスワード

`tennis-matchup-app` の管理認証方針を踏襲する。

Vercel Environment Variables:

```env
ADMIN_LOGIN_ID=<admin-id>
ADMIN_PASSWORD_HASH=<pbkdf2 password hash>
SESSION_SECRET=<random secret>
```

ログイン時:

```text
1. request body から adminId / password を取得
2. ADMIN_LOGIN_ID と adminId を比較
3. ADMIN_PASSWORD_HASH と password をPBKDF2検証
4. 成功時に role=admin のCookieを発行
5. 失敗時は401
```

### 6.6 共有ID/パスワード

Firestore:

```text
lineAccounts/{lineAccountId}
  viewerSharedId
  viewerPasswordHash
```

ログイン時:

```text
1. request body から sharedId / password を取得
2. lineAccounts の active アカウントを取得
3. viewerSharedId と sharedId を比較
4. viewerPasswordHash と password をPBKDF2検証
5. 成功時に role=viewer + lineAccountId のCookieを発行
6. 失敗時は401
```

初回は1アカウント固定のため、共有IDの検索対象は `lineAccounts/default` とする。

将来複数アカウント化する場合は、共有IDの一意性を保証するために以下を追加する。

```text
viewerSharedIdIndex/{normalizedSharedId}
  lineAccountId
  createdAt
```

## 7. パスワードハッシュ方式

### 7.1 保存形式

```text
pbkdf2:sha256:<iterations>:<base64-salt>:<base64-hash>
```

例:

```text
pbkdf2:sha256:210000:xxxxxxxx:yyyyyyyy
```

### 7.2 検証方針

- Node.js標準 `crypto.pbkdf2` を使用する。
- 平文パスワードは保存しない。
- 比較は可能な限り timing-safe な比較を使う。
- 不正形式のhashは認証失敗として扱う。

### 7.3 生成方法

MVPでは管理用スクリプトでhashを生成し、以下へ設定する。

```text
ADMIN_PASSWORD_HASH
lineAccounts/{lineAccountId}.viewerPasswordHash
```

将来、管理画面で共有パスワードを変更する場合も、保存するのはhashのみとする。

## 8. Firestoreデータ設計

### 8.1 Collections

```text
lineAccounts/{lineAccountId}
messages/{messageId}
viewerSessions?          // 初回は使用しない
adminLoginGuards/{guardId}
auditLogs/{logId}
cronRuns/{runId}
```

### 8.2 lineAccounts

```json
{
  "lineAccountId": "default",
  "displayName": "BB Cafe LINE",
  "credentialProvider": "env",
  "channelId": "1234567890",
  "channelSecretRef": "LINE_CHANNEL_SECRET",
  "channelAccessTokenRef": "LINE_CHANNEL_ACCESS_TOKEN",
  "retentionDays": 90,
  "viewerSharedId": "bb-cafe",
  "viewerPasswordHash": "pbkdf2:sha256:...",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "..."
}
```

制約:

- `retentionDays` のデフォルトは90日。
- `retentionDays` は1以上の整数。
- 変更後に受信したメッセージから新しい保存期間を適用する。
- 既存メッセージの `expiresAt` は原則変更しない。

### 8.3 messages

```json
{
  "messageId": "msg_xxx",
  "lineAccountId": "default",
  "webhookEventId": "01H...",
  "lineMessageId": "line-message-id",
  "sourceType": "user",
  "sourceUserId": "Uxxxxxxxx",
  "sourceGroupId": null,
  "sourceGroupName": null,
  "senderDisplayName": "山田太郎",
  "text": "こんにちは",
  "messageType": "text",
  "sentAt": "...",
  "receivedAt": "...",
  "expiresAt": "...",
  "createdAt": "..."
}
```

グループ投稿例:

```json
{
  "sourceType": "group",
  "sourceUserId": "Uxxxxxxxx",
  "sourceGroupId": "Cxxxxxxxx",
  "sourceGroupName": "ユーザグループ",
  "senderDisplayName": "山田太郎"
}
```

制約:

- `webhookEventId` は重複排除に使う。
- 表示順は `sentAt desc` を基準にする。
- 一覧/APIの表示対象は `expiresAt > now` のメッセージと、`sentAt desc` の直近1000件の和集合とする。
- 自動削除前でも、直近1000件に含まれない期限切れメッセージはAPIレスポンスに含めない。

### 8.4 auditLogs

```json
{
  "logId": "log_xxx",
  "type": "viewer_login_success",
  "actor": "viewer",
  "lineAccountId": "default",
  "requestId": "req_xxx",
  "result": "success",
  "message": "Viewer login succeeded",
  "createdAt": "..."
}
```

保存対象:

- 管理者ログイン成功/失敗。
- 閲覧者ログイン成功/失敗。
- 管理者による設定変更。
- 管理者による手動削除。
- 自動削除実行結果。
- Webhook署名検証失敗。

保存しない情報:

- パスワード平文。
- LINE channel secret。
- LINE channel access token。
- Cookie値。

### 8.5 cronRuns

```json
{
  "runId": "cron_20260526",
  "type": "delete_expired_messages",
  "startedAt": "...",
  "finishedAt": "...",
  "totalMessageCount": 1200,
  "expiredMessageCount": 150,
  "deletedCount": 150,
  "skippedReason": null,
  "status": "success"
}
```

## 9. LINE Webhook設計

### 9.1 Endpoint

```text
POST /api/line/webhook/{lineAccountId}
```

### 9.2 処理フロー

```text
1. lineAccountId をURLから取得
2. LineCredentialProvider で channelSecret を取得
3. raw body と x-line-signature で署名検証
4. JSONを解析
5. events を順に処理
6. message.type === "text" のみ保存
7. source.type が user / group のどちらでも保存
8. webhookEventId で重複排除
9. 取消イベントは対象メッセージを削除
10. LINEへ短時間で200を返す
```

### 9.3 保存対象イベント

対象:

```text
event.type = "message"
event.message.type = "text"
```

対象外:

```text
image
video
audio
file
sticker
location
follow
join
leave
postback
```

対象外イベントは保存しないが、必要に応じてデバッグログには種別のみ残す。

### 9.4 取消イベント

対象:

```text
event.type = "unsend"
```

処理:

```text
1. lineMessageId を取得
2. messages から該当ドキュメントを検索
3. 該当メッセージを削除
4. 見つからない場合は成功扱い
```

理由:

- 送信者の取消意図を尊重する。
- 取消済み本文を画面に残さない。

### 9.5 送信者名取得

1対1:

```text
source.userId からプロフィールを取得する
```

グループ:

```text
source.groupId + source.userId からグループメンバープロフィールを取得する
```

失敗時:

```text
senderDisplayName = "不明なユーザー"
```

送信者名は投稿時点の値として固定保存する。

### 9.6 グループ名取得

グループ投稿時はLINE APIでグループ名の取得を試行する。

取得失敗時:

```text
sourceGroupName = "ユーザグループ"
```

グループ名を取得できない場合も、グループ投稿の表示名は必ず `"ユーザグループ"` とする。

## 10. API設計

### 10.1 閲覧者API

```text
POST /api/viewer/login
POST /api/viewer/logout
GET  /api/viewer/session
GET  /api/messages
GET  /api/messages/{messageId}
```

### 10.2 管理者API

```text
POST   /api/admin/login
POST   /api/admin/logout
GET    /api/admin/session
GET    /api/admin/settings
PATCH  /api/admin/settings
DELETE /api/admin/messages/{messageId}
GET    /api/admin/messages
GET    /api/admin/cron-runs
```

### 10.3 Cron API

```text
GET /api/cron/delete-expired-messages
```

Request header:

```http
Authorization: Bearer <CRON_SECRET>
```

### 10.4 共通レスポンス

成功:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_xxx"
  }
}
```

失敗:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証が必要です。"
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 10.5 エラーコード

| Status | Code | 用途 |
| ---: | --- | --- |
| 400 | `INVALID_JSON` | JSON解析失敗 |
| 400 | `BAD_REQUEST` | 必須項目不足 |
| 401 | `UNAUTHORIZED` | 未ログイン、認証失敗 |
| 403 | `FORBIDDEN` | 権限不足 |
| 404 | `NOT_FOUND` | 対象なし |
| 409 | `CONFLICT` | 重複などの競合 |
| 422 | `VALIDATION_ERROR` | 入力値不正 |
| 429 | `RATE_LIMITED` | ログイン試行制限 |
| 500 | `INTERNAL_SERVER_ERROR` | 想定外エラー |
| 503 | `SERVICE_UNAVAILABLE` | 設定不足、Firestore障害 |

## 11. UI設計

### 11.1 閲覧者ログイン

表示項目:

- 共有ID入力。
- パスワード入力。
- ログインボタン。
- 認証失敗メッセージ。

### 11.2 メッセージ一覧

表示項目:

- 送信者。
- 送信時刻。
- トーク種別。
- グループ名または個別トーク。
- 本文概要。

並び順:

```text
sentAt desc
```

更新:

- 30秒ごとの自動再取得。
- 手動更新ボタン。

空状態:

```text
表示できるメッセージはありません。
```

### 11.3 メッセージ詳細

表示項目:

- 本文全文。
- 送信者。
- 送信時刻。

初回対象外:

- 返信。
- 添付プレビュー。
- 監査情報表示。

### 11.4 管理画面

表示項目:

- 保存期間。
- 共有ID。
- 共有パスワード変更。
- メッセージ一覧。
- メッセージ削除。
- 自動削除履歴。

削除操作:

- 管理者のみ実行可能。
- 削除前に確認ダイアログを表示する。
- 削除後は一覧から消す。

## 12. 自動削除設計

### 12.1 方針

Firestore TTLは使わない。

Vercel Cronで日次実行し、直近1000件に含まれない期限切れメッセージを通常のFirestore deleteで削除する。

### 12.2 実行条件

```text
1日1回
```

Vercel Cronから以下を呼び出す。

```text
GET /api/cron/delete-expired-messages
```

### 12.3 削除条件

```text
expiresAt <= now
```

ただし、以下は削除対象から除外する。

```text
sentAt desc の直近1000件
```

直近1000件の境界に同一 `sentAt` のメッセージが複数ある場合は、誤削除を避けるため境界と同一 `sentAt` のメッセージも保護対象に含める。

### 12.4 削除上限

```text
最大 10000件/日
```

1回のCron実行で最大10000件まで削除する。

### 12.5 処理フロー

```text
1. Authorization Bearer を検証
2. `sentAt desc` で直近1000件を確認し、保護境界の `sentAt` を決める
3. 総数が1000件以下なら全件を保護対象として skipped 終了
4. `expiresAt <= now` かつ直近1000件に含まれないメッセージを `sentAt asc` で取得
5. 最大10000件まで削除
6. cronRuns に結果を保存
7. 削除件数、保護件数、スキップ理由、失敗件数をログ出力
```

### 12.6 表示との関係

直近1000件は、期限切れであっても物理削除しない。

閲覧者APIと管理者APIの通常一覧では、以下の和集合を表示対象にする。

```text
expiresAt > now
OR sentAt desc の直近1000件
```

これにより、通常は保存期間を超えた古いメッセージを非表示にしつつ、履歴が少ない状態や直近履歴として必要な範囲では空表示を避ける。

## 13. 環境変数

```env
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key>

ADMIN_LOGIN_ID=<admin-id>
ADMIN_PASSWORD_HASH=<pbkdf2 password hash>
SESSION_SECRET=<random secret>

LINE_DEFAULT_ACCOUNT_ID=default
LINE_CHANNEL_ID=<line-channel-id>
LINE_CHANNEL_SECRET=<line-channel-secret>
LINE_CHANNEL_ACCESS_TOKEN=<line-channel-access-token>

CRON_SECRET=<random secret>
```

将来の暗号化Firestore保存で追加:

```env
APP_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
APP_ENCRYPTION_KEY_VERSION=v1
```

## 14. セキュリティ設計

### 14.1 必須対策

- LINE Webhook署名を検証する。
- 不正署名のWebhookは保存しない。
- Firestoreはクライアントから直接読ませない。
- Route Handlerで認証・認可を行う。
- CookieはHttpOnlyにする。
- Cookie値はHMAC署名し、改ざんを検出する。
- パスワード平文を保存しない。
- LINEチャネル秘匿情報をログに出さない。
- `CRON_SECRET` 不一致では削除しない。
- 管理者以外は削除できない。

### 14.2 ログに出さない情報

- パスワード平文。
- パスワードhashの全量。
- LINE channel secret。
- LINE channel access token。
- Cookie値。
- Webhook raw bodyの全量。

### 14.3 ログに出す情報

- requestId。
- endpoint。
- status。
- lineAccountId。
- event type。
- message type。
- deletedCount。
- skippedReason。

本文ログは原則出さない。

## 15. 実装順

1. 詳細設計書を追加する。
2. Next.jsアプリの初期構成を確認または作成する。
3. Firebase Admin SDK接続層を作る。
4. crypto helperを作る。
5. session cookie helperを作る。
6. LineCredentialProviderを作る。
7. 管理者ログインAPIを作る。
8. 閲覧者ログインAPIを作る。
9. LINE Webhook APIを作る。
10. メッセージ一覧/詳細APIを作る。
11. 管理画面APIを作る。
12. Vercel Cron削除APIを作る。
13. 閲覧画面を作る。
14. 管理画面を作る。
15. テストを追加する。
16. 本番ビルドを確認する。

## 16. テスト設計

### 16.1 テスト観点一覧

機能観点:

- LINE 1対1テキストメッセージを保存できること。
- LINE グループテキストメッセージを保存できること。
- 新着順で一覧表示できること。
- 詳細で本文全文を表示できること。
- 30秒ごとの再取得ができること。
- 手動更新ができること。
- 管理者がメッセージを削除できること。
- Vercel Cronで期限切れメッセージを削除できること。

非機能観点:

- Webhookが短時間で応答すること。
- LINE署名不正を拒否できること。
- Cookie改ざんを拒否できること。
- Firestore障害時にfail closedできること。
- 無料枠運用を前提に削除上限を守ること。
- 同一実行環境で削除処理が重複実行されても破綻しないこと。

データ観点:

- `user` source と `group` source の差異を保存できること。
- 送信者名が投稿時点で固定されること。
- グループ名取得失敗時に `ユーザグループ` が保存されること。
- `webhookEventId` で重複排除できること。
- `expiresAt` が保存期間から正しく計算されること。
- 直近1000件に含まれない期限切れデータが一覧/APIに表示されないこと。

UI観点:

- 共有ID/パスワードのログイン失敗が分かること。
- 空一覧が分かること。
- 長文が崩れず表示されること。
- グループ投稿と個別投稿を区別できること。
- モバイル幅でも送信者、時刻、本文概要が読めること。
- 削除後に一覧から消えること。

### 16.2 正常系

| Case | 対象 | 意図 |
| --- | --- | --- |
| N-001 | Webhook | 1対1のテキストメッセージを保存できる |
| N-002 | Webhook | グループのテキストメッセージを保存できる |
| N-003 | Webhook | グループ名取得失敗時に `ユーザグループ` を保存する |
| N-004 | 閲覧ログイン | 正しい共有ID/パスワードでログインできる |
| N-005 | 管理ログイン | 正しい管理者ID/パスワードでログインできる |
| N-006 | 一覧 | `sentAt desc` で新着順表示できる |
| N-007 | 詳細 | 本文全文、送信者、送信時刻を表示できる |
| N-008 | 手動更新 | 更新ボタンで最新状態を取得できる |
| N-009 | 自動更新 | 30秒ごとに再取得できる |
| N-010 | 管理削除 | 管理者がメッセージを削除できる |
| N-011 | 自動削除 | 直近1000件に含まれない期限切れメッセージを削除できる |

### 16.3 異常系

| Case | 対象 | 意図 |
| --- | --- | --- |
| E-001 | Webhook | LINE署名不正なら保存しない |
| E-002 | Webhook | 未対応メッセージ種別は保存しない |
| E-003 | Webhook | Firestore保存失敗時にエラーログを残す |
| E-004 | Webhook | 重複 `webhookEventId` を二重保存しない |
| E-005 | 閲覧ログイン | 共有ID不一致なら拒否する |
| E-006 | 閲覧ログイン | 共有パスワード不一致なら拒否する |
| E-007 | 管理ログイン | 管理者ID不一致なら拒否する |
| E-008 | 管理ログイン | 管理者パスワード不一致なら拒否する |
| E-009 | Cookie | Cookie改ざん時に未ログイン扱いにする |
| E-010 | Cron | `CRON_SECRET` 不一致なら削除しない |
| E-011 | Cron | Firestore削除失敗時に失敗件数を記録する |

### 16.4 境界値

| Case | 対象 | 意図 |
| --- | --- | --- |
| B-001 | 保存期間 | `retentionDays=1` で `expiresAt` を計算できる |
| B-002 | 保存期間 | `retentionDays=90` をデフォルトとして扱う |
| B-003 | 自動削除 | 総数999件では全件が保護され削除しない |
| B-004 | 自動削除 | 総数1000件では全件が保護され削除しない |
| B-005 | 自動削除 | 総数1001件以上で直近1000件外の期限切れを削除対象にする |
| B-006 | 自動削除 | 削除対象10000件まで削除する |
| B-007 | 自動削除 | 削除対象10001件以上でも10000件までに制限する |
| B-008 | 自動削除 | 直近1000件の境界と同一 `sentAt` のメッセージを保護する |
| B-009 | 一覧 | 同一 `sentAt` の投稿でも安定して表示できる |
| B-010 | 本文 | 長文テキストがUIを壊さない |

### 16.5 状態遷移

| Flow | 意図 |
| --- | --- |
| 未受信 -> 受信済み | Webhook受信後に一覧へ出る |
| 受信済み -> 詳細表示 | 一覧から詳細へ遷移できる |
| 受信済み -> 期限切れ | `expiresAt <= now` かつ直近1000件外になると一覧から消える |
| 期限切れ -> 自動削除済み | 直近1000件外の期限切れメッセージがCronで物理削除される |
| 受信済み -> 手動削除済み | 管理者削除で一覧から消える |
| 受信済み -> 取消削除済み | unsendイベントで削除される |
| ログイン済み -> セッション期限切れ | 24時間後に再ログインが必要になる |

### 16.6 実行順序・依存関係

- Webhook保存テストは署名検証、イベント分類、保存処理を分けて検証する。
- 一覧/詳細テストはFirestoreへ既知データを投入してから実行する。
- Cron削除テストは総数条件と期限切れ条件を分けて実行する。
- 管理者削除とCron削除は同じメッセージに対して競合しても成功扱いにできるようにする。
- 通しテストでは、受信 -> 一覧 -> 詳細 -> 削除 -> 一覧非表示まで確認する。

### 16.7 証跡

失敗時に取得する情報:

- requestId。
- endpoint。
- HTTP status。
- error code。
- lineAccountId。
- sourceType。
- messageType。
- webhookEventId。
- sentAt。
- expiresAt。
- cron runId。
- deletedCount。
- skippedReason。

取得しない情報:

- パスワード平文。
- LINEチャネル秘匿情報。
- Cookie値。

## 17. 未決事項

以下は実装開始時に確定する。

- Next.jsのバージョン。
- Firestore project ID。
- Vercel project名。
- 初期管理者ID。
- 初期共有ID。
- PBKDF2 iterations。
- 管理画面のPC専用制限を入れるかどうか。

## 18. 受け入れ条件

- LINE公式アカウントへの1対1テキスト投稿がWebアプリに表示される。
- LINE公式アカウントを追加したグループのテキスト投稿がWebアプリに表示される。
- グループ投稿ではグループ名または `ユーザグループ` が表示される。
- 一覧が送信時刻の新着順で表示される。
- 詳細で本文全文、送信者、送信時刻が表示される。
- 共有ID/パスワードなしでは閲覧できない。
- 管理者ID/パスワードなしでは管理画面を操作できない。
- 閲覧者は削除できない。
- 管理者はメッセージを削除できる。
- 直近1000件に含まれない期限切れメッセージは一覧/APIに表示されない。
- 直近1000件は期限切れであっても一覧/APIに表示され、物理削除されない。
- Vercel Cronで直近1000件外の期限切れメッセージを通常削除できる。
- 総数999件、1000件では自動削除しない。
- 総数1001件以上では、直近1000件外の削除対象を最大10000件/日まで削除する。
- LINEチャネル秘匿情報、パスワード平文、Cookie値がログやFirestoreに平文保存されない。
