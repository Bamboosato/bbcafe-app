# Preview環境 確認手順

VercelのPreview Deploymentで、リリース前に確認できる範囲をまとめます。

## 事前に設定するEnvironment Variables

Preview環境でログイン、メッセージ取得、Webhook受信、Push通知、Cronを確認するには、Vercel Project SettingsのEnvironment VariablesでPreviewに以下を設定してください。

| 用途 | 変数 |
| --- | --- |
| Firebase Admin SDK | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| 管理者ログイン | `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD_HASH` |
| 閲覧者ログイン | `VIEWER_SHARED_ID`, `VIEWER_PASSWORD_HASH` |
| セッション署名 | `SESSION_SECRET` |
| アプリ公開URL | `APP_BASE_URL` |
| LINE Messaging API | `LINE_DEFAULT_ACCOUNT_ID`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ACCOUNT_DISPLAY_NAME` |
| 保存期間 | `RETENTION_DAYS` |
| Cron保護 | `CRON_SECRET` |
| Push通知 | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` |
| メッセージ作成 | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_MAX_RETRIES_PER_MODEL`, `GEMINI_RETRY_DELAY_MS`, `MESSAGE_LOCATION` |

`ADMIN_PASSWORD_HASH` と `VIEWER_PASSWORD_HASH` は `npm run hash-password -- <password>` で生成します。
`APP_BASE_URL` は `https://<preview-domain>` の形式で設定します。LINEの確認ボタン用アイコンURLに使用します。

## Preview URLで確認する項目

1. `/` を開き、閲覧者ログイン画面が表示されること。
2. Preview用の共有ID/パスワードでログインできること。
3. メッセージ一覧が表示され、フィルター、詳細表示、手動更新が動作すること。
4. `/admin` を開き、管理者ID/パスワードでログインできること。
5. 管理者画面でメッセージ一覧、設定、Cron実行履歴が表示されること。
6. LINE Developers ConsoleでPreview URLの `/api/line/webhook/default` をWebhook URLに設定し、Webhook検証が成功すること。
7. テスト送信したLINEメッセージが閲覧者画面と管理者画面に反映されること。
8. Push通知を使う場合は、ブラウザで通知を許可し、新着メッセージ通知が届くこと。

## ローカルでPreview相当まで確認するコマンド

Previewへ反映する前に、以下の順で確認します。

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
curl -I http://localhost:3000/
curl -s -i http://localhost:3000/api/viewer/session
```

`npm run build` が成功すれば、Next.jsの本番ビルドとしてPreview Deploymentに載せられる状態です。`npm run start` 後に `/` が `200 OK` を返せば、ログイン前画面まではPreview相当で確認できます。

## 環境変数なしで確認できる範囲

環境変数を未設定のままでも、以下は確認できます。

- `/` の初期HTMLが `200 OK` を返すこと。
- `/api/viewer/session` が未ログイン状態を返すこと。
- 静的アセット、manifest、Service Workerがビルド対象に含まれること。

ログイン後のメッセージ取得、管理者操作、LINE Webhook、Push通知、Cronは、FirebaseやLINEなどのPreview用Environment Variablesが必要です。
