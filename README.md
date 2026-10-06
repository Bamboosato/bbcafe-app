# bbcafe-app

LINE公式アカウントの受信履歴、挨拶文の作成・配信、確認状況を管理するNext.js / FirestoreのWebアプリです。現在のパッケージバージョンは2.0.0です。

## 実装された機能

- Firebase Authのメールアドレス／パスワードログインとパスワード再設定メール。ユーザー作成はFirebase Consoleで行います。
- Firebase AuthユーザーごとのLINEアカウント・データ分離。共有ID／管理者IDによる旧ログインは廃止済みです。
- LINE Webhookの署名検証、1対1・グループ・複数人トークのテキスト保存、送信取消による履歴削除、友だち追加時のユーザ保存。
- 受信・送信履歴の一覧、詳細、フィルター、追加読み込み、自動更新。
- ユーザ情報の永続化、既存受信履歴からの補完、LINE友だち一覧の取り込み、配信対象選択の保存。
- Geminiによる挨拶文作成、本文編集、手動LINE送信。保存済みの配信対象から、今回送るユーザだけを選べます。
- 毎日07:00（日本時間）の自動配信。初期OFF、アカウント・日本日付ごとの重複防止、送信結果と失敗詳細の保存。
- 月日とイベント文による毎年繰り返しのカレンダー情報。追加・編集・削除・有効化と、当日の挨拶文への反映。
- 対象日の名古屋の天気・誕生花・季節の注意情報。管理画面の「外部情報」で、追加の公式情報（感染症週報・熱中症アラート・気象庁注意報）の利用を切り替えます。
- LINEの「確認したよ👍」ボタン、送信先ごとの最新確認状態、ホームの未確認表示、未確認状態の手動リセット。
- PWA／Web Pushによる新着受信・自動配信結果・未確認通知。通知先は同じLINEアカウントに紐づくアプリの通知登録端末です。
- 管理画面でLINE連携情報・受信／送信保存期間を更新。資格情報は暗号化保存し、保存後に再表示しません。
- Cron履歴と期限切れ履歴の自動削除。受信は直近1000件を自動削除から保護し、送信履歴にはこの保護を適用しません。受信メッセージの手動削除APIもあります。

## 画面

| URL | 画面 |
| --- | --- |
| `/` | ホーム：未確認対象、今日の自動配信・予定、直近の処理状況 |
| `/messages` | 受信履歴 |
| `/sent` | 送信履歴・送信先別の確認状況 |
| `/cron-runs` | 自動削除・自動配信・確認チェックの履歴 |
| `/users` | ユーザ情報・配信対象選択・友だち取り込み |
| `/send` | メッセージ作成・編集・手動送信・自動配信ON/OFF |
| `/calendar` | カレンダー情報 |
| `/settings` | 管理画面：LINE連携・保存期間・外部情報 |

PCではタブ、スマホではハンバーガーメニューから移動します。未ログイン時は各URLでログイン画面を表示します。独立した`/admin`画面はありません。

## セットアップ

```powershell
npm install
Copy-Item .env.example .env.local
```

Firebase ConsoleでAuthenticationのメール／パスワードを有効化し、ユーザーを作成します。アプリ内に新規登録画面はありません。Firebase Web SDKとAdmin SDKは同じFirebaseプロジェクトへ設定してください。

設定一覧は[.env.example](.env.example)です。`.env.local`はGit管理に含めず、デプロイ先ではVercel Environment Variablesへ設定します。

| 用途 | 変数・設定 |
| --- | --- |
| Firebase Admin SDK | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Firebase Web SDK | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`。`NEXT_PUBLIC_FIREBASE_APP_ID`は任意 |
| アプリセッション | `SESSION_SECRET`：ランダムな秘密値。Cookieは24時間有効 |
| 既存データの初期所有者 | `INITIAL_OWNER_UID`または`INITIAL_OWNER_EMAIL`、`INITIAL_LINE_ACCOUNT_ID` |
| 既定LINEアカウント | `LINE_DEFAULT_ACCOUNT_ID`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ACCOUNT_DISPLAY_NAME` |
| 資格情報暗号化 | `APP_ENCRYPTION_KEY`：32バイト鍵のBase64、`APP_ENCRYPTION_KEY_VERSION`：既定`v1` |
| 受信保存期間 | `RETENTION_DAYS`：既定90日。初回ユーザー割当時には90日で保存されるため、運用値は管理画面で確認・変更 |
| Cron保護 | `CRON_SECRET` |
| 挨拶文作成 | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_MAX_RETRIES_PER_MODEL`, `GEMINI_RETRY_DELAY_MS`, `MESSAGE_LOCATION` |
| 確認ボタン画像URL | `APP_BASE_URL`：HTTPSの公開URL |
| Web Push | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` |

初期所有者に一致するユーザーの初回ログイン時に、`INITIAL_LINE_ACCOUNT_ID`（未設定時は`LINE_DEFAULT_ACCOUNT_ID`、既定`default`）へ既存データを紐づけます。それ以外の新規ユーザーにはUIDから生成した専用の内部アカウントを割り当てます。既存の`authUsers/{uid}`は再割当しません。`.env.example`の初期所有者は既存BB Cafe用の値なので、新規環境では運用するユーザーの値に置き換えてください。

初回ログイン後、管理画面でChannel ID・Channel Secret・Channel Access Tokenを登録します。表示名はLINEから取得します。SecretとTokenは両方入力し、Token検証成功後に暗号化保存します。既定アカウントは、暗号化保存へ切り替えるまで環境変数のLINE資格情報を利用できます。

`APP_BASE_URL`未設定時はVercelのデプロイURLを使用し、HTTPS URLを生成できない場合は確認ボタンをアイコンなしで送ります。

Web Pushのキーは次のコマンドで生成し、環境変数へ設定します。アプリのアカウントメニューで端末ごとに通知を有効にしてください。ブラウザの通知許可とService Workerが必要です。

```powershell
npm run generate-vapid-keys
```

既定モデルは`gemini-3.5-flash-lite`、フォールバックは`gemini-2.5-flash`です。一時的なHTTPエラーではモデルごとに既定1回再試行します。手動作成とCronは共通の生成処理を使います。外部情報の境界・抑制条件は[v2.0.0要件](docs/requirements-v2.0.0.md)を参照してください。

## Firestore設定

FirestoreはサーバーのFirebase Admin SDKからアクセスします。[firestore.rules](firestore.rules)はクライアントの直読みを拒否し、[firestore.indexes.json](firestore.indexes.json)に必要な複合indexを定義しています。

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project "your-firebase-project-id"
```

履歴取得やCronに`FAILED_PRECONDITION: The query requires an index`が出た場合は、対象プロジェクトへのindex反映とFirebase Consoleでの作成完了を確認してください。

## LINE Webhook

管理画面に表示された内部`lineAccountId`のWebhookパスを使用します。LINE Developers ConsoleでWebhook URLを設定し、Use webhookを有効化してください。

```text
https://<your-domain>/api/line/webhook/<lineAccountId>
```

既存BB Cafeのパスは`/api/line/webhook/default`です。Channel IDと内部`lineAccountId`は別の値です。

## Cronと保存期間

[vercel.json](vercel.json)のスケジュールはUTCです。各Cronは有効なLINEアカウントを順番に処理します。

| Path | UTC | 日本時間 | 処理 |
| --- | --- | --- | --- |
| `/api/cron/delete-expired-messages` | `0 18 * * *` | 03:00 | 受信・送信履歴の期限切れ削除 |
| `/api/cron/send-daily-message` | `0 22 * * *` | 07:00 | 自動配信ONのアカウントへ配信 |
| `/api/cron/check-unconfirmed-messages` | `0 4 * * *` | 13:00 | 最新確認対象の集計と未確認Web Push |

確認チェックは13:00の定時処理で、各送信から6時間経過したかは判定しません。未確認者本人へのLINE再送は実装していません。

受信保存期間は既定90日、送信保存期間は既定180日で、管理画面から変更できます。変更は新規保存データに適用されます。ユーザ情報と最新確認対象は、この削除Cronの対象外です。

自動配信は当日のrunIdを開始前に予約します。生成失敗・対象0件・配信失敗でも同日再実行では自動再送せず、`already_ran`で終了します。送信履歴で確認し、必要なら手動送信してください。

### 手動実行

デプロイ先へ`GET`を送り、`Authorization: Bearer <CRON_SECRET>`を指定します。以下は`APP_BASE_URL`と`CRON_SECRET`を実行シェルの環境変数に設定した場合の例です（`.env.local`はPowerShellへ自動で読み込まれません）。

```powershell
$cronRequestHeaders = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Uri "$env:APP_BASE_URL/api/cron/check-unconfirmed-messages" -Headers $cronRequestHeaders
```

他のCronは表のpathに置き換えます。確認チェックは通知、自動配信はLINE送信、削除Cronは物理削除を伴い、全有効アカウントが対象です。Deployment Protection有効時は、そのアクセス制御も通過する必要があります。返却の`results`をアカウント別に確認してください。

## 開発・検証

```powershell
npm run dev
npm run lint
npm run typegen
npm run typecheck
npm run test
npm run test:security
npm run audit:security
npm run build
```

Previewの準備と対象ケースは[Preview環境 確認手順](docs/preview-verification.md)を参照してください。

## CI・依存関係の監査

[GitHub Actions](.github/workflows/ci.yml)はmain向けPR・mainへのpush・手動実行で、Node 24上の品質チェック、依存監査、Firebase SDK互換性確認を独立したジョブとして実行します。品質チェックは`npm ci`、lint、型生成・型検査、全既存Vitest、buildです。本番Firebase鍵・LINE Token等はCIへ渡しません。

`npm run audit:security`は本番依存を例外なしで検査し、全依存では[例外JSON](security-audit-exception.json)に完全一致するdev依存だけを期限付きで許可します。現在のbraces関連例外は2026-11-05 09:00（JST）に失効します。監査成功は全依存の脆弱性0件を意味しません。JSONと判定理由は`.security-audit/`へ保存し、CIでは失敗時もArtifactへ保存します。

Firebaseは同一メジャー内の12.19.0へ更新し、Firestore配下のgrpcを1.14.5へ限定overrideしています。`npm run test:firebase`はJava 21以上を必要とし、固定したfirebase-tools 15.32.1で専用Auth／Firestore Emulatorを起動します。認証トークン照合とAdmin／Web Firestoreのwrite/read/deleteを確認します。アプリ画面のE2Eや実LINE送信の試験は含みません。

導入内容・検証結果・運用は[CI導入記録](docs/ci-verification.md)を参照してください。ワークフロー追加だけではブランチ保護の必須チェック設定になりません。

## 文書一覧

| 文書 | 内容 |
| --- | --- |
| [詳細設計](docs/line-message-viewer-detail-design.md) | 現行の認証、データ、API、保存・運用 |
| [Firebase Auth移行](docs/firebase-auth-channel-migration.md) | 初回割当、旧認証廃止、LINE資格情報 |
| [管理画面統合](docs/admin-integration-spec.md) | 管理画面とCron履歴 |
| [自動送信・画面設定](docs/auto-broadcast-settings-spec.md) | 配信対象、手動／自動配信、送信履歴 |
| [カレンダー情報](docs/calendar-events-spec.md) | 月日イベント |
| [確認ボタン・未確認通知](docs/confirmation-reminder-spec.md) | 確認状態、通知条件、手動リセット |
| [ホーム画面](docs/home-screen-spec.md) | 運用ダッシュボード |
| [Gemini移行設計](docs/gemini-3.5-flash-lite-migration-design.md) | モデル別設定、再試行、外部情報 |
| [v2.0.0要件](docs/requirements-v2.0.0.md) | 天気・季節の注意情報に関する実装済み要件 |
| [文書整合性監査](docs/documentation-audit.md) | 2026-10-06の照合結果・確認範囲 |
| [CI導入検討案](docs/ci-dependency-check-design.md) | 導入方針・テスト観点 |
| [CI導入記録](docs/ci-verification.md) | 実装・検証・依存例外の運用 |
