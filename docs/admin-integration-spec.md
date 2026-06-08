# 管理画面統合 仕様書

## 1. 目的

BB Cafe Messages の入口を `/` に統一し、共有IDログインと管理者ログインを同じログイン画面から扱う。

管理者IDと管理者パスワードでログインした場合のみ、通常の閲覧・送信タブに加えて、管理者向けの `共通設定` と `Cron履歴` を表示する。既存の `/admin` は廃止し、管理機能は統合後の閲覧画面内へ移す。

## 2. テスト観点一覧

詳細ケースを書く前に、以下の観点を満たすことを確認する。

| 観点 | 確認すること |
| --- | --- |
| 機能観点 | 共通ログイン、viewer/admin判定、admin限定タブ表示、設定更新、Cron履歴表示、`/admin` 廃止が意図通り動くこと |
| 非機能観点 | 誤ログイン判定、Cookie衝突、権限境界、設定変更の即時反映、既存viewer機能の回帰がないこと |
| データ観点 | 受信保存期間、送信保存期間、共有ID、共有パスワード、LINE表示名、Cron履歴の保存元が一貫していること |
| UI観点 | PCタブとスマホハンバーガーメニューで、admin限定項目がログイン種別に応じて自然に増減すること |
| 実行観点 | viewerログイン、adminログイン、ログアウト、セッション期限切れ、`/admin` 直アクセスを切り分けられること |

## 3. 確定方針

| 項目 | 方針 |
| --- | --- |
| 入口 | `/` に統一 |
| ログインフォーム | ID + パスワード |
| viewerログイン | 共有ID + 共有パスワード |
| adminログイン | 管理者ID + 管理者パスワード |
| 管理者ID | 初期想定は `admin` |
| adminログイン成功時 | adminセッションとviewerセッションの両方を発行 |
| viewerログイン成功時 | viewerセッションのみ発行 |
| `/admin` | 廃止。アクセス時は404でよい |
| 共有ID制約 | 管理者IDと同じ値は禁止 |
| admin限定タブ | `共通設定`、`Cron履歴` |
| 削除履歴タブ | 作らない。Cron履歴に統合 |
| 送信保存期間変更 | 変更後に作成される送信履歴から適用 |

## 4. 対象外

- 複数管理者アカウント。
- 管理者権限の細分化。
- 手動削除履歴の新規保存。
- `/admin` から統合画面へのリダイレクト互換。
- 共有IDと管理者IDが同一の場合の自動解決。
- 送信保存期間変更時の既存送信履歴 `expiresAt` 一括更新。

## 5. 画面仕様

### 5.1 ログイン画面

`/`、`/sent`、`/users`、`/send`、admin限定URL相当の画面を未ログインで開いた場合、共通ログイン画面を表示する。

表示項目:

- ID。
- パスワード。
- ログインボタン。
- 認証失敗メッセージ。

ログイン判定:

```text
1. IDが管理者IDと一致する場合は、管理者認証を試す。
2. 管理者認証が成功した場合は admin としてログインする。
3. IDが管理者IDと一致しない場合は、共有ID認証を試す。
4. 共有ID認証が成功した場合は viewer としてログインする。
5. どちらにも成功しない場合は、認証失敗として扱う。
```

管理者IDと同じ共有IDは保存できないため、IDが管理者IDと一致する場合に共有IDログインへフォールバックしない。

### 5.2 通常ログイン時のタブ

viewerログイン時は、以下のタブを表示する。

| タブ | URL | 備考 |
| --- | --- | --- |
| 受信履歴 | `/` | 既存の受信メッセージ一覧 |
| 送信履歴 | `/sent` | 手動送信、自動送信の送信履歴 |
| ユーザ情報 | `/users` | ブロードキャスト対象ユーザの選択 |
| メッセージ送信 | `/send` | 手動送信と自動送信ON/OFF |

### 5.3 管理者ログイン時のタブ

adminログイン時は、通常タブに加えて以下を表示する。

| タブ | URL案 | 備考 |
| --- | --- | --- |
| 共通設定 | `/settings` | LINE表示名、保存期間、共有ID/パスワード |
| Cron履歴 | `/cron-runs` | 自動削除と自動送信の履歴 |

PCではタブとして表示する。スマホではハンバーガーメニュー内に通常タブと同じ並びで表示する。

### 5.4 `/admin`

`/admin` は廃止する。

期待動作:

```text
GET /admin -> 404
```

既存の `AdminApp` は削除対象とする。管理機能は統合ViewerApp側へ移す。

## 6. 認証・セッション仕様

### 6.1 セッション

既存Cookieを活用する。

| Cookie | 用途 |
| --- | --- |
| `bbcafe_viewer` | viewer API利用用 |
| `bbcafe_admin` | admin API利用用 |

adminログイン成功時は、通常タブでもviewer APIを利用できるように、`bbcafe_admin` と `bbcafe_viewer` の両方を発行する。

viewerログイン成功時は、`bbcafe_viewer` のみを発行する。

ログアウト時は、両方のCookieをクリアする。

### 6.2 共通認証API

追加するAPI:

| Method | Path | 用途 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | viewer/admin共通ログイン |
| `POST` | `/api/auth/logout` | viewer/admin共通ログアウト |
| `GET` | `/api/auth/session` | 現在のログイン種別確認 |

`POST /api/auth/login` request:

```json
{
  "id": "admin",
  "password": "..."
}
```

admin成功時 response:

```json
{
  "authenticated": true,
  "role": "admin",
  "viewerSharedId": "bbcafe"
}
```

viewer成功時 response:

```json
{
  "authenticated": true,
  "role": "viewer",
  "viewerSharedId": "bbcafe"
}
```

`GET /api/auth/session` response:

```json
{
  "authenticated": true,
  "role": "admin",
  "viewerSharedId": "bbcafe"
}
```

優先順位:

```text
adminセッションが有効なら role=admin
viewerセッションのみ有効なら role=viewer
どちらも無効なら authenticated=false
```

## 7. 共通設定仕様

### 7.1 表示項目

共通設定タブには以下を表示する。

| 項目 | 保存先 | 編集 |
| --- | --- | --- |
| LINE表示名 | `lineAccounts/{lineAccountId}.displayName` | 可能 |
| 保存期間（受信） | `lineAccounts/{lineAccountId}.retentionDays` | 可能 |
| 保存期間（送信） | `automationSettings/dailyBroadcast.historyRetentionDays` | 可能 |
| 共有ID | `lineAccounts/{lineAccountId}.viewerSharedId` | 可能 |
| 共有パスワード変更 | `lineAccounts/{lineAccountId}.viewerPasswordHash` | 可能 |

LINE表示名は、画面表示、通知、将来の複数LINE公式アカウント識別のために残す。

### 7.2 更新ルール

- 受信保存期間は1以上の整数。
- 送信保存期間は1以上の整数。初期値は180日。
- 共有IDは空にできない。
- 共有IDは管理者IDと同じ値にできない。
- 共有パスワードは入力された場合のみ更新する。
- 送信保存期間の変更は、変更後に作成される送信履歴から適用する。
- 既存送信履歴の `expiresAt` は一括更新しない。

### 7.3 API

既存の admin settings API を拡張するか、新しい統合APIを追加する。

推奨:

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/common-settings` | 共通設定取得 |
| `PATCH` | `/api/admin/common-settings` | 共通設定更新 |

`PATCH /api/admin/common-settings` request:

```json
{
  "displayName": "BB Cafe LINE",
  "receivedRetentionDays": 90,
  "sentRetentionDays": 180,
  "viewerSharedId": "bbcafe",
  "viewerPassword": "..."
}
```

## 8. Cron履歴仕様

### 8.1 表示対象

Cron履歴タブには、自動削除と自動送信の履歴を1つの一覧として表示する。

| 種別 | 取得元 |
| --- | --- |
| 自動削除 | `cronRuns` |
| 自動送信 | `lineAccounts/{lineAccountId}/sendRuns` の `mode=auto` |

### 8.2 表示項目

共通項目:

- 種別: `自動削除` / `自動送信`
- ステータス
- 実行日時
- 結果サマリー

自動削除の例:

```text
自動削除 / success / 2026/06/08 03:00 / 削除 0件 / 保護 1000件
```

自動送信の例:

```text
自動送信 / partial_failed / 2026/06/08 07:00 / 成功 9件 / 失敗 1件
```

### 8.3 API

追加するAPI:

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/cron-history` | 自動削除と自動送信の履歴を統合して返す |

response:

```json
{
  "items": [
    {
      "id": "cron_...",
      "kind": "delete_expired_messages",
      "startedAt": "...",
      "status": "success",
      "summary": "削除 0 / 保護 1000"
    },
    {
      "id": "auto_default_20260608",
      "kind": "send_daily_message",
      "startedAt": "...",
      "status": "partial_failed",
      "summary": "成功 9 / 失敗 1"
    }
  ]
}
```

## 9. 削除履歴タブ

独立した削除履歴タブは作らない。

理由:

- 要件上の削除履歴は、現状Admin画面の「自動削除履歴」を指している。
- 自動削除履歴はCron履歴に含める方が自然。
- 手動削除履歴は現時点で保存していないため、削除履歴タブを作ると名称と内容がずれる。

将来、手動削除履歴を保存する場合は、Cron履歴とは別に監査ログまたは削除履歴として設計する。

## 10. 既存APIとの関係

廃止または置き換え候補:

| 既存API | 方針 |
| --- | --- |
| `/api/viewer/login` | `/api/auth/login` に置き換え |
| `/api/viewer/logout` | `/api/auth/logout` に置き換え |
| `/api/viewer/session` | `/api/auth/session` に置き換え |
| `/api/admin/login` | `/api/auth/login` に置き換え |
| `/api/admin/logout` | `/api/auth/logout` に置き換え |
| `/api/admin/session` | `/api/auth/session` に置き換え |
| `/api/admin/settings` | `/api/admin/common-settings` に置き換えまたは互換維持 |
| `/api/admin/cron-runs` | `/api/admin/cron-history` に置き換えまたは互換維持 |

実装時は、画面からの利用を新APIへ移し、不要になった旧APIを削除する。ただし、一度に削除範囲が広くなりすぎる場合は、旧APIを残して未使用化してもよい。

## 11. テストケース

### 11.1 正常系

| Case | 対象 | 意図 |
| --- | --- | --- |
| N-001 | viewerログイン | 共有ID/共有パスワードで通常4タブのみ表示される |
| N-002 | adminログイン | 管理者ID/パスワードで通常4タブ + 共通設定 + Cron履歴が表示される |
| N-003 | admin通常機能 | adminログイン後も受信履歴、送信履歴、ユーザ情報、メッセージ送信を利用できる |
| N-004 | 共通設定取得 | adminログイン時にLINE表示名、受信保存期間、送信保存期間、共有IDを取得できる |
| N-005 | 共通設定更新 | adminログイン時に各設定を更新できる |
| N-006 | Cron履歴 | 自動削除と自動送信の履歴を1つの一覧で表示できる |
| N-007 | ログアウト | admin/viewerどちらでもログアウト時に両Cookieがクリアされる |

### 11.2 異常系

| Case | 対象 | 意図 |
| --- | --- | --- |
| E-001 | admin ID誤り | 管理者IDが一致しない場合はadminログインにならない |
| E-002 | adminパスワード誤り | 管理者IDが一致してもパスワード不一致なら拒否する |
| E-003 | viewer認証誤り | 共有ID/パスワード不一致なら拒否する |
| E-004 | 共有ID衝突 | 共有IDを管理者IDと同じ値に更新できない |
| E-005 | viewer権限 | viewerログインでは共通設定とCron履歴を表示しない |
| E-006 | viewer権限API | viewerログインではadmin限定APIを呼べない |
| E-007 | `/admin` | `/admin` 直アクセスは404になる |

### 11.3 境界値

| Case | 対象 | 意図 |
| --- | --- | --- |
| B-001 | 受信保存期間 | `1` 日を保存できる |
| B-002 | 送信保存期間 | `1` 日を保存できる |
| B-003 | 共有ID | 空文字、空白のみを拒否する |
| B-004 | ID判定 | 大文字小文字や前後空白を正規化して管理者ID衝突を判定する |
| B-005 | Cron履歴0件 | 履歴がない場合に空状態を表示する |
| B-006 | Cron履歴混在 | 自動削除と自動送信が同じ一覧で時刻降順に並ぶ |

### 11.4 状態遷移

| Flow | 意図 |
| --- | --- |
| 未ログイン -> viewerログイン -> 通常タブ表示 | 通常利用者の導線が維持される |
| 未ログイン -> adminログイン -> admin限定タブ表示 | 管理者機能が統合画面に出る |
| adminログイン -> 受信履歴表示 | adminでもviewer APIを利用できる |
| adminログイン -> ログアウト -> viewerログイン | セッションが混ざらない |
| viewerログイン -> `/settings` 相当へ移動 | 権限不足として表示しない、または受信履歴へ戻す |
| `/admin` 直アクセス -> 404 | 旧入口が廃止されている |

### 11.5 実行順序と証跡

- 認証テストは viewer と admin を分けて実行する。
- 同一ブラウザで viewer -> admin -> viewer と切り替えるテストを含める。
- 設定更新テストは、受信保存期間、送信保存期間、共有ID、パスワード変更を分ける。
- Cron履歴テストは、自動削除のみ、自動送信のみ、混在の3ケースを用意する。
- 失敗時は `requestId`、認証種別、対象API、HTTP status、error codeを確認できるようにする。
- パスワード平文、パスワードhash、Cookie値はログに出さない。

## 12. 受け入れ条件

- `/` のログイン画面でIDとパスワードを入力できる。
- 共有IDログインでは通常4タブだけが表示される。
- 管理者ログインでは通常4タブに加えて `共通設定` と `Cron履歴` が表示される。
- スマホではハンバーガーメニューにログイン種別に応じたタブが表示される。
- adminログイン後も受信履歴、送信履歴、ユーザ情報、メッセージ送信を利用できる。
- 共通設定でLINE表示名、受信保存期間、送信保存期間、共有ID、共有パスワードを扱える。
- 共有IDを管理者IDと同じ値にできない。
- Cron履歴で自動削除と自動送信の履歴を1つの一覧として確認できる。
- `/admin` は廃止され、404になる。
- viewerログインではadmin限定タブとadmin限定APIを利用できない。
