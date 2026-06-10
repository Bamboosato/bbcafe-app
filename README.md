# bbcafe-app

LINE公式アカウントに届いたテキストメッセージを、Firebase Authのメールアドレス/パスワードで閲覧するWebアプリです。

## 実装範囲

- LINE Messaging API Webhook受信
- 1対1トーク、グループトークのテキスト保存
- Firebase Authログイン: メールアドレス + パスワード
- パスワードリセットメール送信
- メッセージ一覧/詳細
- PWAの新着Push通知
- 管理者によるメッセージ削除
- Vercel Cronによる期限切れメッセージ削除
- 直近1000件は期限切れでも表示/削除保護

## セットアップ

```bash
npm install
cp .env.example .env.local
```

Firebase ConsoleのAuthenticationでログインユーザーを作成します。アプリ側に新規登録画面はありません。

初期移行では、`INITIAL_OWNER_UID` または `INITIAL_OWNER_EMAIL` に一致するFirebase Authユーザーの初回ログイン時に `LINE_DEFAULT_ACCOUNT_ID` のデータが自動で紐づきます。

`.env.local` に設定します。

```env
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase web api key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<firebase auth domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<firebase project id>
SESSION_SECRET=<random secret>
APP_BASE_URL=https://<your-domain>
INITIAL_OWNER_UID=JsYf0oEHvcNG3Ch2ttxTO824i4Q2
INITIAL_OWNER_EMAIL=takes.ngo.jp@gmail.com
INITIAL_LINE_ACCOUNT_ID=default
RETENTION_DAYS=90
APP_ENCRYPTION_KEY=<base64-encoded 32-byte key>
APP_ENCRYPTION_KEY_VERSION=v1
```

その他、Firebase Admin SDK、LINE Messaging API、Cron用の値も `.env.local` またはVercel Environment Variablesへ設定します。
`APP_BASE_URL` はLINEの確認ボタン用アイコンURL生成に使います。未設定の場合、VercelのデプロイURLが取得できる環境ではそれを使用し、取得できない場合はアイコンなしで送信します。

Push通知を使う場合はVAPIDキーを生成し、`.env.local` とVercel Environment Variablesへ設定します。

```bash
npm run generate-vapid-keys
```

```env
WEB_PUSH_PUBLIC_KEY=<generated public key>
WEB_PUSH_PRIVATE_KEY=<generated private key>
WEB_PUSH_SUBJECT=mailto:your-contact@example.com
```

メッセージ作成は `GEMINI_MODEL` を優先し、一時的な高負荷やレート制限では短く再試行したあと `GEMINI_FALLBACK_MODELS` の順にフォールバックします。未設定時のフォールバック先は `gemini-2.5-flash-lite` です。

Firestoreはサーバー側のFirebase Admin SDKからのみアクセスする前提です。`firestore.rules` はクライアント直読みを拒否し、`firestore.indexes.json` に必要な複合indexを定義しています。

## Firestore indexの反映

自動削除とメッセージ一覧は `messages` の複合indexを前提にしています。自動削除履歴に `FAILED_PRECONDITION: The query requires an index` が出た場合は、Firebaseプロジェクトへ `firestore.indexes.json` が未反映です。

```bash
npx firebase-tools deploy --only firestore:indexes --project bbcafe-app
```

`firebase.json` は `firestore.indexes.json` を参照しています。index作成中は同じエラーが続くことがあるため、Firebase Consoleで作成完了を確認してからCronを再実行してください。

## Cronの手動実行

Vercelに登録済みのCronは、Vercel CLIから手動実行できます。

確認チェックCron:

```bash
npx vercel crons run /api/cron/check-unconfirmed-messages
```

確認チェックCronは、未確認者がいる場合に通知を送信し、Cron履歴へ実行結果を保存します。通知送信を伴うため、実行前に未確認対象が残っている前提で扱ってください。

ほかのCronを手動実行する場合は、以下のpathを指定します。

```bash
npx vercel crons run /api/cron/send-daily-message
npx vercel crons run /api/cron/delete-expired-messages
```

`send-daily-message` は当日分が未送信の場合にLINE配信を実行します。`delete-expired-messages` は保存期間外の履歴を削除します。

`vercel crons run` が使えない場合やDeployment Protectionの影響を受ける場合は、Vercel CLIで認証済みの状態で `npx vercel curl` を使ってください。直接HTTPで呼び出す場合は `Authorization: Bearer <CRON_SECRET>` が必要です。

## LINE Webhook URL

Production:

```text
https://<your-domain>/api/line/webhook/default
```

LINE Developers ConsoleでWebhook URLを設定し、Use webhookを有効化してください。

## コマンド

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

## Preview環境での確認

Preview Deploymentで確認するためのEnvironment Variablesと確認項目は、[Preview環境 確認手順](docs/preview-verification.md)を参照してください。

## 設計書

[LINE Message Viewer 詳細設計](docs/line-message-viewer-detail-design.md)
