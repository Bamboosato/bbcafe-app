# Firebase Auth channel migration

## Scope

Migrate from the legacy `admin` / `viewer` login model to Firebase Auth email/password login.

## Decisions

- One Firebase Auth user owns one LINE channel.
- A LINE channel is not shared by multiple users.
- The current `lineAccountId=default` remains the internal account ID for BB Cafe.
- `takes.ngo.jp@gmail.com` (`uid=JsYf0oEHvcNG3Ch2ttxTO824i4Q2`) is provisioned to `lineAccountId=default` on first login.
- App-side signup is not provided. Users are created in Firebase Console Authentication.
- Password reset email is available from the login screen.
- Legacy `bbcafe_admin` and `bbcafe_viewer` cookies are ignored and cleared.
- Channel credentials are registered or updated only. They are not displayed after saving.
- `channelAccessToken` is validated before encrypted storage.
- `channelSecret` is validated by required-value checks and later by successful webhook signature verification.
- Retention changes apply only to data created after the change.

## Data Model

```text
authUsers/{uid}
  uid
  email
  lineAccountId
  status: "active" | "disabled"
  createdAt
  updatedAt

lineAccounts/{lineAccountId}
  ownerUid
  lineAccountId
  displayName
  channelId
  credentialProvider: "env" | "encryptedFirestore"
  retentionDays
  status: "active" | "disabled"
  accessTokenValidatedAt
  webhookVerifiedAt
  createdAt
  updatedAt

lineAccounts/{lineAccountId}/credentials/current
  encryptedChannelSecret
  encryptedChannelAccessToken
  encryptionKeyVersion
  updatedAt
```

## Test Viewpoints

| Category | Viewpoint |
| --- | --- |
| Functional | Firebase login, first-login provisioning, password reset, channel settings update, credential validation, Cron per active channel |
| Non-functional | Old-cookie bypass prevention, cross-channel data leakage prevention, LINE API failure behavior, sequential Cron processing |
| Data | Existing `default` data remains readable, new users get a dedicated internal account, encrypted credentials are not returned to UI |
| UI | Login form uses email/password, reset mail copy is account-enumeration safe, management screen no longer shows shared ID/password |

## Priority Bugs To Prevent

- A legacy `bbcafe_admin` or `bbcafe_viewer` cookie authorizes an API after migration.
- A user can choose another user's `lineAccountId` from the client.
- Invalid LINE credentials overwrite the currently working credentials.
- Common Cron stops processing all channels because one channel fails.
- Existing `messages.lineAccountId="default"` data becomes inaccessible to the initial owner.
