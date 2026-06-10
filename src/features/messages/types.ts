export type SourceType = "group" | "user";

export type LineAccountView = {
  accessTokenValidatedAt?: null | string;
  channelId: string;
  credentialProvider: "encryptedFirestore" | "env";
  displayName: string;
  lineAccountId: string;
  retentionDays: number;
  status: "active" | "disabled";
  viewerSharedId?: string;
  webhookVerifiedAt?: null | string;
};

export type CommonSettingsView = {
  accessTokenValidatedAt: null | string;
  channelAccessTokenConfigured: boolean;
  channelId: string;
  channelSecretConfigured: boolean;
  displayName: string;
  lineAccountId: string;
  receivedRetentionDays: number;
  sentRetentionDays: number;
  webhookUrlPath: string;
};

export type UserInfoView = {
  broadcastSelected: boolean;
  fetchedAt: string;
  firstSeenAt: string;
  lastMessageAt: string;
  lastSeenAt: string;
  lineAccountId: string;
  userId: string;
  userName: string;
};

export type AutomationSettingsView = {
  enabled: boolean;
  historyRetentionDays: number;
  lineAccountId: string;
  scheduleMode: "fixed_deploy";
  sendTimeJst: string;
  timeZone: "Asia/Tokyo";
  updatedAt: null | string;
};

export type MessageView = {
  expiresAt: string;
  lineAccountId: string;
  messageId: string;
  messageType: "text";
  sentAt: string;
  sourceGroupId: null | string;
  sourceGroupName: null | string;
  sourceType: SourceType;
  sourceUserDisplayName: string;
  sourceUserId: null | string;
  senderDisplayName: string;
  text: string;
};

export type SendRunMode = "auto" | "manual";

export type SendRunStatus = "failed" | "partial_failed" | "success";

export type SendRunTargetConfirmationStatus = "confirmed" | "not_required" | "pending" | "reminded";

export type SendRunTargetView = {
  confirmationStatus?: SendRunTargetConfirmationStatus;
  confirmedAt?: null | string;
  errorCode?: string;
  httpStatus?: number;
  reminderSentAt?: null | string;
  status: "failed" | "success";
  userId: string;
  userName: string;
};

export type SendRunView = {
  createdAt: null | string;
  expiresAt: string;
  failedCount: number;
  finishedAt: null | string;
  historyRetentionDays: number;
  lineAccountId: string;
  messageText: string;
  mode: SendRunMode;
  requestId: string;
  runId: string;
  sentAt: string;
  startedAt: string;
  status: SendRunStatus;
  successCount: number;
  targetCount: number;
  targets: SendRunTargetView[];
  trigger: "cron" | "viewer";
  updatedAt: null | string;
};

export type CronRunView = {
  deletedCount: number;
  failedCount: number;
  finishedAt: null | string;
  lineAccountId: string;
  protectedCount: number;
  runId: string;
  skippedReason: null | string;
  startedAt: string;
  status: "failed" | "skipped" | "success";
};

export type ConfirmationCheckTargetView = {
  confirmedAt: null | string;
  reminderSentAt: null | string;
  status: "confirmed" | "unconfirmed";
  userId: string;
  userName: string;
};

export type ConfirmationReminderRunView = {
  confirmedCount: number;
  confirmedTargets: ConfirmationCheckTargetView[];
  failedCount: number;
  finishedAt: null | string;
  lineAccountId: string;
  notifiedCount: number;
  runId: string;
  skippedReason: null | string;
  startedAt: string;
  status: "failed" | "partial_failed" | "skipped" | "success";
  targetCount: number;
  unconfirmedCount: number;
  unconfirmedTargets: ConfirmationCheckTargetView[];
};

export type CronHistoryItemKind = "check_unconfirmed_messages" | "delete_expired_messages" | "send_daily_message";

export type CronHistoryItemView = {
  confirmedCount?: number;
  confirmedTargets?: ConfirmationCheckTargetView[];
  finishedAt: null | string;
  id: string;
  kind: CronHistoryItemKind;
  startedAt: string;
  status: string;
  summary: string;
  unconfirmedCount?: number;
  unconfirmedTargets?: ConfirmationCheckTargetView[];
};
