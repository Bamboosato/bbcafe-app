# LINE Message Viewer 詳細設計

2026-10-06時点の実装を記載する。旧共有ID／管理者ID認証の初期設計を現行のFirebase Auth方式へ改訂した。変更履歴はGit履歴を参照する。機能別の詳細・テスト観点は末尾の関連文書に記載する。

## 1. 全体構成と実装範囲

Next.js App Routerの画面とRoute HandlerをVercelに配置し、Firebase Authで認証、Firebase Admin SDKでFirestoreへアクセスする。LINE Messaging APIのWebhookで受信し、Push APIで手動／自動配信する。PWAのService WorkerはWeb Pushを受け取る。

| 項目 | 現行仕様 |
| --- | --- |
| アカウント | Firebase Authユーザーごとに内部`lineAccountId`を割当 |
| 受信 | テキストのみ。1対1・グループ・複数人トーク |
| 配信 | 保存済み配信対象への共通本文。手動時は対象の一部選択が可能 |
| 作成 | Gemini、当日のカレンダー、名古屋の天気・誕生花・注意情報 |
| 自動配信 | 初期OFF、毎日07:00 JST、アカウント／日本日付ごとに1回 |
| 確認 | LINEクイックリプライpostback。既読状態を取得する機能ではない |
| 通知 | 新着受信・自動配信結果・未確認者のサマリーをアプリ端末へWeb Push |
| 管理 | LINE資格情報、受信／送信保存期間、追加外部情報ON/OFF |
| 保存期間 | 受信既定90日、送信既定180日。新規保存時に期限を確定 |

画像・動画・音声の保存、アプリ内ユーザー登録、個別本文の生成、未確認者本人へのLINEリマインダー、送信失敗時の自動再送は実装範囲外。

## 2. 認証とアカウント割当

### 2.1 ログイン

1. クライアントがFirebase Web SDKでメール／パスワードログインする。
2. IDトークンを`POST /api/auth/login`へ`{ "idToken": "..." }`として送る。
3. サーバーがFirebase Admin SDKでトークンを検証し、`authUsers/{uid}`を取得・初回作成する。
4. `status=active`かつ内部アカウントがある場合に`bbcafe_auth_v2` Cookieを発行する。

応答は`data`と`meta.requestId`を持つ。ログイン成功時の`data`は`authenticated`, `displayName`, `email`, `lineAccountId`。セッション照会は`GET /api/auth/session`、ログアウトは`POST /api/auth/logout`。

CookieはHMAC-SHA256署名付きで、payloadは`uid`, `email`, `lineAccountId`, `role: "account"`, `exp`。有効期限24時間、HttpOnly、SameSite=Lax、Path=/、本番ではSecure。署名鍵は`SESSION_SECRET`。

`requireViewerSession`と`requireAdminSession`は両方ともこのアカウントCookieを検証する。現行UIではviewer/adminの権限分岐を行わず、ログインユーザーは自身のアカウントの管理機能も利用する。各APIのアカウントはCookieから決定し、クライアントから別アカウントを選ばせない。

旧`bbcafe_admin`／`bbcafe_viewer` Cookieは現行APIの認可に使わず、ログイン・ログアウト・セッション照会でクリアする。旧`/api/admin/login`と`/api/viewer/login`は`401 UNAUTHORIZED`と「このログイン方式は廃止されました。」を返す。旧session/logoutパスは互換用に残る。`hash-password`スクリプトと旧ハッシュ関連コードは残存するが、現行ログインの設定には不要。

### 2.2 初回割当

`INITIAL_OWNER_UID`または正規化した`INITIAL_OWNER_EMAIL`に一致する初回ログインは、`INITIAL_LINE_ACCOUNT_ID`へ割り当てる。未設定時は`LINE_DEFAULT_ACCOUNT_ID`（既定`default`）。他の初回ユーザーは`user_<UIDのハッシュ先頭24文字>`へ割り当てる。`authUsers`と`lineAccounts`の作成はトランザクションで行う。既存`authUsers`の割当は変更しない。

初回作成の`lineAccounts`には`ownerUid`、`status=active`、`retentionDays=90`を保存する。`RETENTION_DAYS`は既定アカウントの未保存値の補完にも使うが、初回作成値を上書きする設定ではない。

アプリ内に登録画面はなく、ユーザー作成はFirebase Consoleで行う。パスワード再設定メールはFirebase Web SDKから送り、登録有無を断定しない文言を表示する。

### 2.3 認証の境界

現行の保護APIはCookieの署名・期限を確認する方式であり、各リクエストでFirebaseトークンや`authUsers.status`を再照会する方式ではない。Firebase側の無効化が既発行Cookieへ即時反映される保証はない。複数ユーザーの同一LINEチャネル所有をアプリの登録UIで提供していないが、Channel IDの全アカウント一意性を検証する処理もない。

## 3. LINE資格情報

| 保存方式 | 用途 |
| --- | --- |
| `env` | 既定アカウントの`LINE_CHANNEL_SECRET`／`LINE_CHANNEL_ACCESS_TOKEN` |
| `encryptedFirestore` | アカウント別の暗号化資格情報 |

保存先は`lineAccounts/{lineAccountId}/credentials/current`。`encryptedChannelSecret`, `encryptedChannelAccessToken`, `encryptionKeyVersion`, `updatedAt`を保持し、`APP_ENCRYPTION_KEY`を使ったAES-256-GCMで暗号化する。鍵は32バイトのBase64、バージョンは既定`v1`。

管理画面ではChannel ID、Secret、Tokenを入力する。SecretとTokenは両方必要で、TokenによるLINE bot情報取得が成功してから保存する。表示名はbot情報から取得し、自由編集しない。Channel ID変更時は資格情報の再入力が必要。資格情報を空欄にして保存する場合、既存値を維持する。

APIは設定済みフラグとToken検証日時を返し、秘密値を返さない。Secret自体の正しさはWebhook署名検証で確認する。`webhookVerifiedAt`はアカウントデータへ記録するが、現行の共通設定レスポンスには含めていない。

## 4. Firestoreデータ

| パス | 内容・主な項目 |
| --- | --- |
| `authUsers/{uid}` | `uid`, `email`, `lineAccountId`, `status`, 作成・更新時刻 |
| `lineAccounts/{lineAccountId}` | `ownerUid`, `channelId`, `displayName`, `credentialProvider`, `retentionDays`, `status`, Token検証・Webhook確認時刻 |
| `lineAccounts/{lineAccountId}/credentials/current` | 暗号化Secret／Token、鍵バージョン |
| `messages/{messageId}` | 内部アカウント、LINEメッセージID、WebhookイベントID、送信元、本文、`sentAt`, `receivedAt`, `expiresAt` |
| `lineAccounts/{lineAccountId}/users/{userId}` | 表示名、`broadcastSelected`、初回・最終確認・最終受信時刻 |
| `lineAccounts/{lineAccountId}/automationSettings/dailyBroadcast` | 自動配信ON/OFF、送信保存期間、固定時刻、外部情報設定、感染症表示履歴 |
| `lineAccounts/{lineAccountId}/calendarEvents/{eventId}` | 月日、イベント文、有効状態、並び順 |
| `lineAccounts/{lineAccountId}/sendRuns/{runId}` | 配信本文、手動／自動、成功／失敗数、送信先スナップショット、確認状態、保存期限 |
| `lineAccounts/{lineAccountId}/confirmationTargets/{userId}` | ユーザごとの最新成功配信のrunId、確認状態、確認／通知時刻 |
| `lineAccounts/{lineAccountId}/confirmationReminderRuns/{runId}` | 確認チェック結果、確認済／未確認対象、Push結果 |
| `cronRuns/{runId}` | アカウント別の受信削除履歴、保護数、削除数、結果 |
| `pushSubscriptions/{subscriptionId}` | 内部アカウント、通知endpoint、鍵 |

日時は保存時にFirestore Timestampへ変換し、APIではISO文字列として返す。受信メッセージIDはWebhookイベントIDのハッシュから決定し、再配信されたイベントの重複保存と新着通知を抑える。

受信・送信履歴は1ページ既定20件、最大50件で`nextCursor`による追加読み込みを行う。現行カーソルは送信時刻であり、同一時刻の大量データについて完全なページ境界を保証する複合カーソルではない。

FirestoreはAdmin SDKからのみアクセスし、クライアントの直接アクセスは`firestore.rules`で拒否する。複合indexは`firestore.indexes.json`をデプロイする。

## 5. LINE Webhookとユーザ情報

`POST /api/line/webhook/{lineAccountId}`で受ける。URLの値は内部アカウントIDでありChannel IDではない。Raw bodyとChannel Secretを使って`x-line-signature`を検証する。

| イベント | 処理 |
| --- | --- |
| テキスト`message` | 送信元プロフィールを取得、ユーザ情報upsert、メッセージ保存、新規保存時だけWeb Push |
| `follow` | ユーザ情報upsert。初期の配信選択はOFF |
| `unsend` | 同アカウント・LINEメッセージIDの受信履歴を削除 |
| 確認`postback` | postback内のuserIdと実際の送信元が一致する場合、確認状態を更新 |
| その他 | 無視。非テキスト本文は保存しない |

グループ・複数人トークは画面上`group`として扱う。名前取得失敗時は代替表示名で保存する。

ユーザ情報は受信履歴と独立して保存し、受信履歴削除では消さない。既存受信からのbackfill、友だち一覧取り込みでも補完できる。取り込みはLINE APIが許可する範囲であり、取得不能なユーザーまで列挙できる保証はない。

## 6. 作成と配信

### 6.1 共通生成処理

手動作成と自動配信は`generateDailyGreetingMessage()`を使う。日本時間の日付に対応した天気・カレンダー・誕生花・直近の冒頭文・注意情報を入力にする。モデル既定値と設定は[Gemini設計](./gemini-3.5-flash-lite-migration-design.md)、外部情報の選定・失敗時の縮退は[v2.0.0要件](./requirements-v2.0.0.md)を参照する。

外部情報OFFでも通常の気象庁天気とWBGT予測は利用する。追加の感染症週報、熱中症アラート、愛知県注意報をOFFにする設定である。警報・特別警報は取得・構造化するが、通常挨拶の注意報表示と緊急通知は別の範囲。

### 6.2 配信対象と履歴

`broadcastSelected=true`を永続化された正式な配信対象とする。手動送信の`userIds`はその集合から今回送る一部を選択するための値であり、未選択ユーザや別アカウントへ送ることはできない。未指定なら正式な対象全員、空配列や対象外IDは400。

LINE Pushは送信先ごとに逐次実行する。1回の配信を1件の`sendRun`に保存し、本文・ユーザ名・結果をスナップショットにする。結果は`success`, `partial_failed`, `failed`。成功対象は`pending`、失敗対象は`not_required`として確認対象を区別する。

### 6.3 自動配信

`enabled=false`ならスキップする。有効時は`auto_{lineAccountId}_{yyyyMMdd}`を作成予約してから生成・配信する。同じrunIdが存在すれば`already_ran`。対象0件、生成失敗、配信失敗でも予約済みの同日runIdを自動再利用しない。初期予約は`status=failed`、`finishedAt=null`であり、中断時はこの状態が残り得る。

送信時刻は画面で変更できず、`vercel.json`と表示用固定時刻を変更して再デプロイする。送信結果は本文を含めないWeb Pushサマリーを通知し、クリックで`/sent`へ移動する。

## 7. 確認状態とWeb Push

「確認したよ👍」のpostbackにrunIdとuserIdを含める。最新成功配信の確認対象はユーザ単位で上書きする。古いボタン押下は古いsendRunを更新しても、最新runIdが異なる確認対象を変更しない。

状態は`pending -> confirmed`、`pending -> reminded -> confirmed`。`reminded`も未確認表示に含む。ホームの「未確認をリセット」は、アプリ利用者が最新の未確認対象と対応する履歴を確認済みへ更新する操作であり、LINE側の押下を意味しない。

確認チェックは13:00 JSTに最新対象を集計し、`pending`があれば同アカウントのアプリ通知登録端末へWeb Pushする。送信から6時間の経過判定と未確認者本人へのLINE再送は行わない。

現行処理ではVAPID未設定の`missing_web_push_config`なら`pending`を維持する。一方、Push処理がスキップされなければ、購読0件や全件送信失敗でも`reminded`へ更新する。したがって「通知済み」は端末への到達を保証しない。詳細は[確認仕様](./confirmation-reminder-spec.md)。

新着Pushは本文を含めず、登録端末だけへ通知する。購読endpointが404／410なら削除する。通知許可、Service Worker、HTTPS等のブラウザ条件に依存する。

## 8. API一覧

`account`は`bbcafe_auth_v2`による本人の内部アカウント認証。認証不要APIでも、Firebaseトークン・署名・Cron秘密値など個別の検証を行う。

| Method | Path | 認証・用途 |
| --- | --- | --- |
| POST | `/api/auth/login` | Firebase IDトークンからCookie発行 |
| POST | `/api/auth/logout` | Cookieクリア |
| GET | `/api/auth/session` | 現行セッション照会 |
| GET | `/api/app-version` | バージョン取得 |
| GET | `/api/messages` | account、受信履歴ページ取得 |
| GET | `/api/messages/{messageId}` | account、受信詳細 |
| GET | `/api/users` | account、ユーザ取得・補完 |
| GET | `/api/users/summary` | account、選択人数 |
| PATCH | `/api/users/{userId}` | account、配信選択保存 |
| POST | `/api/users/import-line-followers` | account、LINE友だち取り込み |
| GET | `/api/sent-messages` | account、送信履歴ページ取得 |
| GET | `/api/sent-messages/{runId}` | account、配信詳細 |
| GET / POST | `/api/calendar-events` | account、一覧・当日イベント取得／追加 |
| PATCH / DELETE | `/api/calendar-events/{eventId}` | account、編集／削除 |
| GET / PATCH | `/api/message-assistant/automation-settings` | account、自動配信設定 |
| POST | `/api/message-assistant/generate` | account、挨拶文作成 |
| POST | `/api/message-assistant/send` | account、手動配信 |
| GET / POST | `/api/confirmation-targets` | account、最新未確認対象取得／手動リセット |
| GET | `/api/push/public-key` | 認証不要、公開VAPIDキー。未設定503 |
| POST / DELETE | `/api/push/subscription` | account、購読登録／解除 |
| GET / PATCH | `/api/admin/common-settings` | account、現行の管理画面設定 |
| GET | `/api/admin/cron-history` | account、3種類の統合履歴 |
| GET | `/api/admin/cron-runs` | account、受信削除履歴 |
| GET | `/api/admin/messages` | account、受信履歴の管理用API |
| DELETE | `/api/admin/messages/{messageId}` | account、受信物理削除。現行UIに削除ボタンはない |
| GET / PATCH | `/api/admin/settings` | account、旧設定項目も残る互換API。現行画面はcommon-settingsを使用 |
| POST | `/api/line/webhook/{lineAccountId}` | LINE署名、Webhook |
| GET | `/api/cron/delete-expired-messages` | CRON_SECRET、期限切れ削除 |
| GET | `/api/cron/send-daily-message` | CRON_SECRET、自動配信 |
| GET | `/api/cron/check-unconfirmed-messages` | CRON_SECRET、確認チェック |

旧`/api/admin/login`, `/api/viewer/login`, `/api/admin/session`, `/api/viewer/session`, `/api/admin/logout`, `/api/viewer/logout`の位置づけは2.1節のとおり。

## 9. 画面

全8画面のURL・表示順は[ホーム画面仕様](./home-screen-spec.md)を参照する。`/`はホーム、受信履歴は`/messages`。`/settings`は本人の管理画面、独立した`/admin`は廃止済み。PCタブとスマホメニューは同じ画面へ移動する。

受信・送信履歴はフィルター、詳細、追加読み込みと定期更新を持つ。フィルターは画面に読み込んだ履歴へ適用する。ユーザ情報の正式な配信対象選択は保存し、手動送信の今回だけの絞り込みは正式な選択を変更しない。

## 10. Cron・削除・運用の境界

| Cron | UTC | JST |
| --- | --- | --- |
| 期限切れ削除 | `0 18 * * *` | 03:00 |
| 自動配信 | `0 22 * * *` | 07:00 |
| 確認チェック | `0 4 * * *` | 13:00 |

`Authorization: Bearer <CRON_SECRET>`を必須とする。未設定503、不一致401。Cronは`listActiveLineAccounts()`で取得したアカウントを順番に処理し、1アカウントの失敗を記録して他の処理を続ける。有効アカウントの検索結果が0件の場合、既定アカウントへフォールバックする。応答の`results`を確認し、HTTP 200のみで全処理成功を判断しない。

受信は`sentAt`降順の直近1000件を期限切れでも自動削除から保護し、1アカウント1実行で最大10000件を削除する。送信取消と手動削除にはこの保護を適用しない。送信履歴は`expiresAt <= now`を最大200件削除し、直近保護はしない。

受信・送信保存期間は新規データの`expiresAt`へ適用し、既存期限を一括変更しない。ユーザ情報、カレンダー、最新確認対象、確認チェック履歴、Cron履歴、暗号化資格情報をこの削除Cronで削除する機能はない。

現行の取得上限は有効アカウント100、配信ユーザ／確認対象1000、カレンダー500、Push購読500（各アカウント）。全データを無制限に処理する設計ではない。

Cron画面は受信削除`cronRuns`、自動配信`sendRuns`、確認チェック`confirmationReminderRuns`を集約する。OFF／重複による自動配信スキップは新しいsendRunを作らない。送信履歴削除数は削除API応答に含まれるが、受信削除履歴と統合画面のサマリーには保存しない。

## 11. 検証観点

詳細ケースを作る前に以下を整理する。秘密値、Cookie、Firebaseトークン、Push鍵を証跡へ出さない。

| 観点 | 検証意図 |
| --- | --- |
| 機能 | 認証、受信、ユーザ補完、選択、作成・配信、確認、設定、削除の経路が文書と一致する |
| 非機能 | 外部API遅延・障害、認可、複数アカウント処理、Cron重複、非同期競合を切り分ける |
| データ | 別アカウント分離、旧default維持、暗号化、最新runId、期限・スナップショットが一貫する |
| UI | PC／スマホ、8画面、空状態・長文、読込中・エラー表示を確認する |

| 区分 | 前提と検証意図 |
| --- | --- |
| 正常系 | 専用テストアカウントでログインから配信・確認・履歴まで通す |
| 異常系 | 不正トークン、旧Cookie、別アカウントID、外部API失敗で越権・誤送信しない |
| 境界値 | 0件、ページ上限、1000／1001件、日付変更、2月29日、保存期限境界を確認する |
| 状態遷移 | OFF→ON、同日予約→失敗→再実行、pending→reminded→confirmed、古いpostbackを確認する |

対象単体テストと型・ビルド確認を変更リスクに応じて選ぶ。E2Eは対象ケース／クロスブラウザー／全件／未実施から選定理由を明示し、同一実機・同一LINEアカウントへ並列実行しない。実送信時は対象と初期状態を固定し、requestId、runId、時刻、結果を保存する。

## 12. 関連文書

- [Firebase Auth移行](./firebase-auth-channel-migration.md)
- [管理画面統合](./admin-integration-spec.md)
- [自動送信・画面設定](./auto-broadcast-settings-spec.md)
- [カレンダー情報](./calendar-events-spec.md)
- [確認ボタン・未確認通知](./confirmation-reminder-spec.md)
- [ホーム画面](./home-screen-spec.md)
- [Gemini移行設計](./gemini-3.5-flash-lite-migration-design.md)
- [v2.0.0要件](./requirements-v2.0.0.md)
- [Preview確認](./preview-verification.md)
- [文書監査結果](./documentation-audit.md)
