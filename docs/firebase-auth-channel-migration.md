# Firebase Auth channel migration

Implementation status: implemented; reconciled with the source on 2026-10-06. See [current detail design](./line-message-viewer-detail-design.md) for API contracts and operational limits.

## Scope

Migrate from the legacy `admin` / `viewer` login model to Firebase Auth email/password login.

## Decisions

- One Firebase Auth user owns one LINE channel.
- The supported provisioning model assigns a dedicated internal account to each user. Channel ID uniqueness across accounts is not validated by the current credential-registration API.
- The current `lineAccountId=default` remains the internal account ID for BB Cafe.
- `takes.ngo.jp@gmail.com` (`uid=JsYf0oEHvcNG3Ch2ttxTO824i4Q2`) is provisioned to `lineAccountId=default` on first login.
- App-side signup is not provided. Users are created in Firebase Console Authentication.
- Password reset email is available from the login screen.
- Legacy `bbcafe_admin` and `bbcafe_viewer` cookies are ignored and cleared.
- The current cookie is `bbcafe_auth_v2`, expires after 24 hours, and has `role: "account"`. Viewer and admin guards both authorize this account session for its own data.
- Legacy login endpoints return HTTP 401 with the removed-login-method message. They cannot issue a current session.
- Channel credentials are registered or updated only. They are not displayed after saving.
- `channelAccessToken` is validated before encrypted storage.
- Validation fetches LINE bot information and its display name; it does not prove that the entered Channel ID matches the token. A blank Secret and Token preserve saved credentials; changing the Channel ID requires both values.
- `channelSecret` is validated by required-value checks and later by successful webhook signature verification.
- Retention changes apply only to data created after the change.
- Existing `authUsers/{uid}` assignments are preserved. Non-owner first logins use `user_<first 24 characters of UID hash>`; provisioning initially stores 90 received-retention days.
- Protected requests verify the signed app cookie, without rechecking Firebase revocation or `authUsers.status` on every request. Account disablement does not guarantee immediate invalidation of an already issued cookie.

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
