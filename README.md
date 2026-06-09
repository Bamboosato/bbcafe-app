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
APP_BASE_URL=https://<your-domain>

VIEWER_SHARED_ID=bbcafe
VIEWER_PASSWORD_HASH=<generated viewer hash>
RETENTION_DAYS=90
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
