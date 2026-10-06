# Preview環境 確認手順

2026-10-06時点のFirebase Auth・アカウント別LINE連携の実装を対象とする。

## 1. 前提条件と環境設定

Preview専用のFirebaseユーザー・データ・LINEチャネル・配信対象を用意する。本番と同じFirestoreやLINE資格情報を使う場合、手動操作とCronが同じ実データを更新する。実行前に対象アカウント、配信選択、自動配信ON/OFF、当日のrunIdと確認対象を確認する。

Vercel Project SettingsのPreview環境へ以下を設定する。`NEXT_PUBLIC_*`はビルドに反映されるため、設定変更後は再デプロイする。

| 用途 | 変数 |
| --- | --- |
| Firebase Admin SDK | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Firebase Web SDK | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`。`NEXT_PUBLIC_FIREBASE_APP_ID`は任意 |
| セッション署名 | `SESSION_SECRET` |
| 初期所有者移行 | `INITIAL_OWNER_UID`または`INITIAL_OWNER_EMAIL`, `INITIAL_LINE_ACCOUNT_ID` |
| 既定LINE連携 | `LINE_DEFAULT_ACCOUNT_ID`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ACCOUNT_DISPLAY_NAME` |
| 資格情報暗号化 | `APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY_VERSION` |
| 受信保存期間の補完値 | `RETENTION_DAYS`。保存済み値・初回割当の90日設定は管理画面で確認 |
| 確認ボタンの画像URL | `APP_BASE_URL=https://<preview-domain>` |
| Cron保護 | `CRON_SECRET` |
| Push | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` |
| 作成 | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_MAX_RETRIES_PER_MODEL`, `GEMINI_RETRY_DELAY_MS`, `MESSAGE_LOCATION` |

Firebase Consoleでメール／パスワード認証を有効化し、テストユーザーを作成する。必要な認証ドメイン・パスワードリセット設定、Firestoreのrules／indexesも対象プロジェクトへ反映する。`ADMIN_LOGIN_ID`, `ADMIN_PASSWORD_HASH`, `VIEWER_SHARED_ID`, `VIEWER_PASSWORD_HASH`は現行ログインに不要。

新規ユーザーのLINE資格情報は初回ログイン後の管理画面から登録する。Webhookパスは内部アカウントIDごとに異なるため、管理画面の値を使う。既定の`default`をすべてのユーザーに流用しない。

## 2. テスト観点と実行範囲

詳細ケースの前に、次を整理する。

| 観点 | 検証意図 |
| --- | --- |
| 機能 | ログイン、受信、作成、対象選択、配信、確認、カレンダー、設定、Cronが連動する |
| 非機能 | 旧Cookie拒否、別アカウント分離、外部API・通信失敗、重複実行を切り分ける |
| データ | 初期割当、暗号化、最新runId、履歴期限・配信対象の整合を確認する |
| UI | PC／スマホ、通知許可、空状態、読込中、長文・失敗表示を確認する |

変更リスクに応じて対象ケースのみ／クロスブラウザー／全件／未実施を選び、理由と未実施範囲を記録する。全件を既定にしない。同一実機・同一LINEアカウントへスクリプトを並列実行しない。

## 3. Preview URLで確認するケース

| 区分 | 前提・操作 | 検証意図 |
| --- | --- | --- |
| 正常系 | テストユーザーでログイン、再読込、ログアウト、再設定メール | Firebase認証と24時間Cookie、登録有無を断定しない文言を確認 |
| 正常系 | PCとスマホ幅で8画面へ移動 | `/`のホームと`/messages`の受信履歴、URL直接アクセスの復帰を確認 |
| 正常系 | 管理画面で資格情報登録、表示Webhook URLをLINEへ設定・検証 | Token検証、秘密値非表示、Webhook署名を確認 |
| 正常系 | LINEテキスト受信、友だち追加・取り込み、正式な配信対象保存 | 受信／ユーザ情報の反映と永続化を確認 |
| 正常系 | 当日のカレンダー登録→作成→本文編集→一部の対象へ手動送信 | 正式対象内の絞り込み、共通本文、配信履歴を確認 |
| 異常系 | 不正資格情報、旧Cookie、別アカウントのID、通知許可拒否 | 越権・誤送信を防ぎ、画面が失敗を表示する |
| 境界値 | 0件、20件超の履歴、40／41文字イベント、日付境界 | 空状態・ページング・入力制限・JST当日判定を確認 |
| 状態遷移 | 新規配信→確認ボタン、旧ボタン押下、未確認リセット | 最新配信だけを未確認対象にし、手動リセットを区別する |
| 状態遷移 | 自動配信OFF→ON→同日再実行 | OFFは送信なし、同日予約済みは失敗時も再送なし |
| 状態遷移 | 保存期間変更→新規保存 | 新規期限のみ変わり、受信直近1000件保護を維持する |

Web Pushは端末ごとに許可・登録し、新着、配信結果、未確認サマリーとクリック先を確認する。登録0件・VAPID未設定・Push失敗時の確認状態は[確認仕様](./confirmation-reminder-spec.md)を参照する。

Cronの手動呼出しは[README](../README.md#手動実行)に従う。PreviewのProtection設定も確認する。自動配信・通知・物理削除を伴うため、対象データと実行順序を固定する。HTTPステータスとアカウント別`results`の両方を確認する。実際の定時起動はデプロイ先のCron設定・実行履歴で別途確認する。

## 4. ローカル確認

```powershell
npm ci
npm run lint
npm run typegen
npm run typecheck
npm run test
npm run test:security
npm run audit:security
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

別ターミナルで`/`と`/api/auth/session`を確認する。ビルド成功だけでログイン後の動作・実配信・Push到達を確認済みとはしない。

SDK更新の互換性確認にはJava 21以上を用意し、別途`npm run test:firebase`を実行する。専用デモEmulatorだけを利用する。CI検査と依存例外の運用は[CI導入記録](./ci-verification.md)を参照する。

環境変数なしでも、初期HTML、未ログインのsession応答、静的アセット・manifest・Service Workerのビルドを確認できる。Firebaseログインとログイン後のデータ操作・外部連携には設定が必要。

## 5. 証跡

実行日時（JST）、コミット、URL、ブラウザ／OS、テストアカウント、初期状態、手順、期待値、実測、requestId／runIdを記録する。失敗は実装・テスト観点・データ・環境のどこに原因があるかを切り分け、フレークは再現条件とタイミング仮説を残す。秘密値・Cookie・IDトークン・Push鍵は記録しない。
