import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString } from "@/lib/server/firestoreUtils";
import type { LineAccountView } from "../types";

export const DEFAULT_LINE_ACCOUNT_ID = process.env.LINE_DEFAULT_ACCOUNT_ID?.trim() || "default";
export const DEFAULT_VIEWER_SHARED_ID = "bbcafe";
export const DEFAULT_RETENTION_DAYS = 90;

export type LineAccountRecord = LineAccountView & {
  channelAccessTokenRef: string;
  channelSecretRef: string;
  createdAt: null | string;
  updatedAt: null | string;
  viewerPasswordHash: string;
};

type UpdateSettingsInput = {
  displayName?: string;
  lineAccountId?: string;
  retentionDays?: number;
  viewerPasswordHash?: string;
  viewerSharedId?: string;
};

export async function getLineAccount(lineAccountId = DEFAULT_LINE_ACCOUNT_ID) {
  const db = getAdminDb();
  const snapshot = await db.collection("lineAccounts").doc(lineAccountId).get();

  if (!snapshot.exists) {
    return defaultLineAccount(lineAccountId);
  }

  return toLineAccountRecord(lineAccountId, snapshot.data() ?? {});
}

export async function updateLineAccountSettings(input: UpdateSettingsInput) {
  const lineAccountId = input.lineAccountId || DEFAULT_LINE_ACCOUNT_ID;
  const current = await getLineAccount(lineAccountId);
  const nextRetentionDays = normalizeRetentionDays(input.retentionDays ?? current.retentionDays);
  const db = getAdminDb();

  await db
    .collection("lineAccounts")
    .doc(lineAccountId)
    .set(
      {
        channelAccessTokenRef: current.channelAccessTokenRef,
        channelId: current.channelId,
        channelSecretRef: current.channelSecretRef,
        credentialProvider: current.credentialProvider,
        displayName: input.displayName?.trim() || current.displayName,
        lineAccountId,
        retentionDays: nextRetentionDays,
        status: current.status,
        updatedAt: FieldValue.serverTimestamp(),
        viewerPasswordHash: input.viewerPasswordHash ?? current.viewerPasswordHash,
        viewerSharedId: input.viewerSharedId?.trim() || current.viewerSharedId,
        ...(current.createdAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

  return getLineAccount(lineAccountId);
}

export function toLineAccountView(record: LineAccountRecord): LineAccountView {
  return {
    channelId: record.channelId,
    credentialProvider: record.credentialProvider,
    displayName: record.displayName,
    lineAccountId: record.lineAccountId,
    retentionDays: record.retentionDays,
    status: record.status,
    viewerSharedId: record.viewerSharedId,
  };
}

function defaultLineAccount(lineAccountId: string): LineAccountRecord {
  return {
    channelAccessTokenRef: "LINE_CHANNEL_ACCESS_TOKEN",
    channelId: process.env.LINE_CHANNEL_ID?.trim() || "",
    channelSecretRef: "LINE_CHANNEL_SECRET",
    createdAt: null,
    credentialProvider: "env",
    displayName: process.env.LINE_ACCOUNT_DISPLAY_NAME?.trim() || "BB Cafe LINE",
    lineAccountId,
    retentionDays: normalizeRetentionDays(Number(process.env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS)),
    status: "active",
    updatedAt: null,
    viewerPasswordHash: process.env.VIEWER_PASSWORD_HASH?.trim() || "",
    viewerSharedId: process.env.VIEWER_SHARED_ID?.trim() || DEFAULT_VIEWER_SHARED_ID,
  };
}

function toLineAccountRecord(lineAccountId: string, data: FirebaseFirestore.DocumentData): LineAccountRecord {
  return {
    channelAccessTokenRef: String(data.channelAccessTokenRef ?? "LINE_CHANNEL_ACCESS_TOKEN"),
    channelId: String(data.channelId ?? process.env.LINE_CHANNEL_ID ?? ""),
    channelSecretRef: String(data.channelSecretRef ?? "LINE_CHANNEL_SECRET"),
    createdAt: toIsoString(data.createdAt),
    credentialProvider: data.credentialProvider === "encryptedFirestore" ? "encryptedFirestore" : "env",
    displayName: String(data.displayName ?? process.env.LINE_ACCOUNT_DISPLAY_NAME ?? "BB Cafe LINE"),
    lineAccountId,
    retentionDays: normalizeRetentionDays(Number(data.retentionDays ?? DEFAULT_RETENTION_DAYS)),
    status: data.status === "disabled" ? "disabled" : "active",
    updatedAt: toIsoString(data.updatedAt),
    viewerPasswordHash: String(data.viewerPasswordHash ?? process.env.VIEWER_PASSWORD_HASH ?? ""),
    viewerSharedId: String(data.viewerSharedId ?? process.env.VIEWER_SHARED_ID ?? DEFAULT_VIEWER_SHARED_ID),
  };
}

function normalizeRetentionDays(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(value, 3650);
}
