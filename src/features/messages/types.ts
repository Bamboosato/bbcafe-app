export type SourceType = "group" | "user";

export type LineAccountView = {
  channelId: string;
  credentialProvider: "encryptedFirestore" | "env";
  displayName: string;
  lineAccountId: string;
  retentionDays: number;
  status: "active" | "disabled";
  viewerSharedId: string;
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
  senderDisplayName: string;
  text: string;
};

export type CronRunView = {
  deletedCount: number;
  failedCount: number;
  finishedAt: null | string;
  protectedCount: number;
  runId: string;
  skippedReason: null | string;
  startedAt: string;
  status: "failed" | "skipped" | "success";
};
