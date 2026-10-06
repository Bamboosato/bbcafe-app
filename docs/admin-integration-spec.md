# 管理画面統合 仕様書

2026-10-06時点の実装に合わせ、旧共有ID／admin認証の仕様を改訂した。認証・初回割当は[Firebase Auth移行](./firebase-auth-channel-migration.md)、全体は[詳細設計](./line-message-viewer-detail-design.md)を参照する。

## 1. 目的と現行方針

Firebase Authでログインしたユーザーが、自身のLINEアカウントの閲覧・配信・設定・Cron履歴を同じアプリから利用する。独立した`/admin`画面と共有ID／管理者IDによるログインは廃止済み。

| 項目 | 仕様 |
| --- | --- |
| 入口 | `/`。各画面URLからもログイン可能 |
| ログイン | Firebase Authメールアドレス／パスワード |
| セッション | `bbcafe_auth_v2`、24時間 |
| 管理画面 | `/settings`。本人のアカウント設定 |
| Cron履歴 | `/cron-runs`。本人の3種類の処理結果 |
| 権限 | 現行ではviewer/adminの画面分岐なし。全ログインユーザーが本人の設定を利用 |
| ナビゲーション | PCタブ／スマホメニュー。8画面の順序は[ホーム仕様](./home-screen-spec.md) |

## 2. テスト観点

詳細ケースの前に、次を確認する。

| 観点 | 意図 |
| --- | --- |
| 機能 | ログイン、設定取得・更新、Cron統合履歴が実装と一致する |
| 非機能 | 旧Cookieの拒否、別アカウント分離、LINE検証失敗・通信遅延の動作を確認する |
| データ | 秘密値を再表示しない、期限変更は新規保存だけ、既存資格情報を空欄で維持する |
| UI | PC／スマホで同じ設定が使え、保存中・失敗・設定済みが区別できる |
| 実行 | 送信やCronと設定変更の順序依存を確認し、テスト用アカウントと証跡を固定する |

## 3. 認証API

`POST /api/auth/login`へFirebase IDトークンを送り、`GET /api/auth/session`でセッションを確認し、`POST /api/auth/logout`で終了する。レスポンスは`data`と`meta.requestId`。

`/api/admin/*`というパス名でも、保護APIは`bbcafe_auth_v2`を検証し、Cookieの`lineAccountId`を使用する。別アカウントをクライアントから指定するAPIではない。旧ログインパスは401と廃止文言を返し、旧Cookieは認可に使わない。

## 4. 管理画面

### 4.1 表示と保存

| 項目 | 表示・更新 |
| --- | --- |
| LINE表示名 | Token検証時にLINE bot情報から取得。自由編集しない |
| Channel ID | 必須。変更時はSecretとTokenを再入力 |
| Channel Secret | 新規登録／更新用。保存済みの値は再表示しない |
| Channel Access Token | 新規登録／更新用。保存前にLINE bot情報取得で検証 |
| 保存期間（受信） | 正の整数、既定90日 |
| 保存期間（送信） | 正の整数、既定180日 |
| 外部情報 | 追加の公式情報を利用するON/OFF。未保存はOFF |
| Webhook URL | 内部`lineAccountId`を含むパスを表示 |

SecretとTokenは両方入力するか、両方空欄で既存値を維持する。片方だけの入力は400。Token検証失敗時は暗号化資格情報を保存しない。Channel Secret自体の確認はWebhook署名検証で行う。

受信・送信保存期間変更は、変更後に作成されるデータの`expiresAt`へ適用し、既存データの期限を変更しない。受信の直近1000件保護と送信履歴の削除を分けて扱う。

外部情報OFFでも通常の天気とWBGT予測は継続する。追加対象と警報表示の境界は[v2.0.0要件](./requirements-v2.0.0.md)を参照する。

### 4.2 API

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/admin/common-settings` | 現行画面用の設定取得 |
| PATCH | `/api/admin/common-settings` | 設定更新 |

PATCH例（資格情報を変更しない場合）:

```json
{
  "channelId": "1234567890",
  "receivedRetentionDays": 90,
  "sentRetentionDays": 180,
  "externalCareSignalsEnabled": false
}
```

資格情報を更新する場合は`channelSecret`と`channelAccessToken`を追加する。応答の設定は`lineAccountId`, `channelId`, `displayName`, `receivedRetentionDays`, `sentRetentionDays`, `externalCareSignalsEnabled`, `channelSecretConfigured`, `channelAccessTokenConfigured`, `accessTokenValidatedAt`, `webhookUrlPath`。秘密値と共有ID／パスワードを返さない。

旧`/api/admin/settings`は互換APIとして残るが、現行画面の保存先は`common-settings`。共有ID／パスワード項目が旧コードに残っていても、現行ログインには利用しない。

## 5. Cron履歴

`GET /api/admin/cron-history?limit=20`で以下を集約する。

| 処理 | 参照データ | 表示 |
| --- | --- | --- |
| 期限切れ削除 | `cronRuns` | 受信削除数、保護数、結果、スキップ理由 |
| 自動配信 | `sendRuns`の`mode=auto` | 対象数、成功数、失敗数、結果 |
| 確認チェック | `confirmationReminderRuns` | 確認済／未確認数・名前、Push通知数、結果 |

別の削除履歴タブは作らない。自動配信OFF／同日重複のスキップは新しいsendRunを作らず、毎回のCron呼出しが必ず新規行になる仕様ではない。送信履歴の期限切れ削除数は削除API応答に含まれるが、受信削除履歴や統合画面のサマリーには保存しない。

`reminded`の表示はPush到達保証ではない。購読0件や全件失敗時も更新される現行条件は[確認仕様](./confirmation-reminder-spec.md)を参照する。

## 6. 確認ケース

前提：FirebaseとLINEをテスト用に分離し、既存資格情報・保存期間・配信対象を固定する。秘密値は証跡へ出さない。

| 区分 | 操作・前提 | 検証意図 |
| --- | --- | --- |
| 正常系 | ログインして設定取得・保存 | 全ログインユーザーが本人の設定だけ利用できる |
| 正常系 | 有効なTokenとSecretを保存 | LINE表示名取得、暗号化保存、秘密値を再表示しない |
| 異常系 | 旧Cookieのみ、期限切れ、別アカウントの操作 | 認可を通過せず、データが混ざらない |
| 異常系 | 不正Token、資格情報片方だけ、Channel IDのみ変更 | 400と既存資格情報維持を確認する |
| 境界値 | 保存期間0、負数、小数、1 | 正の整数の制約を確認する |
| 状態遷移 | 資格情報登録済→空欄保存 | 既存Secret／Tokenを維持する |
| 状態遷移 | 保存期間変更→新規受信／配信 | 新規期限だけ変更され、既存期限は維持する |
| 状態遷移 | 外部情報OFF→ON→OFF | 手動作成とCronが同じ設定を読む |

同一LINEアカウントの実送信スクリプトを並列実行しない。E2E範囲は修正のリスクに応じて選び、PC／スマホ、通信失敗、未実施範囲を結果へ明記する。
