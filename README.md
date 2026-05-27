# bbcafe-app

LINE公式アカウントに届いたテキストメッセージを、共有ID/パスワードで閲覧するWebアプリです。

## 実装範囲

- LINE Messaging API Webhook受信
- 1対1トーク、グループトークのテキスト保存
- 閲覧者ログイン: 共有ID + パスワード
- 管理者ログイン: 管理者ID + パスワード
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

パスワードhashを生成します。

```bash
npm run hash-password -- <admin-password>
npm run hash-password -- <viewer-password>
```

`.env.local` に設定します。

```env
ADMIN_LOGIN_ID=admin
ADMIN_PASSWORD_HASH=<generated admin hash>

VIEWER_SHARED_ID=bbcafe
VIEWER_PASSWORD_HASH=<generated viewer hash>
RETENTION_DAYS=90
```

その他、Firebase Admin SDK、LINE Messaging API、Cron用の値も `.env.local` またはVercel Environment Variablesへ設定します。

Push通知を使う場合はVAPIDキーを生成し、`.env.local` とVercel Environment Variablesへ設定します。

```bash
npm run generate-vapid-keys
```

```env
WEB_PUSH_PUBLIC_KEY=<generated public key>
WEB_PUSH_PRIVATE_KEY=<generated private key>
WEB_PUSH_SUBJECT=mailto:your-contact@example.com
```

Firestoreはサーバー側のFirebase Admin SDKからのみアクセスする前提です。`firestore.rules` はクライアント直読みを拒否し、`firestore.indexes.json` に必要な複合indexを定義しています。

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

## 設計書

[LINE Message Viewer 詳細設計](docs/line-message-viewer-detail-design.md)
