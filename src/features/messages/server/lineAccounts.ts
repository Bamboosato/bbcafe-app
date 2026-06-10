import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString } from "@/lib/server/firestoreUtils";
import type { LineAccountView } from "../types";

export const DEFAULT_LINE_ACCOUNT_ID = process.env.LINE_DEFAULT_ACCOUNT_ID?.trim() || "default";
export const DEFAULT_VIEWER_SHARED_ID = "bbcafe";
export const DEFAULT_RETENTION_DAYS = 90;

export type LineAccountRecord = LineAccountView & {
  accessTokenValidatedAt: null | string;
  channelAccessTokenRef: string;
  channelSecretRef: string;
  createdAt: null | string;
  ownerUid: null | string;
  updatedAt: null | string;
  viewerPasswordHash: string;
  webhookVerifiedAt: null | string;
};

type UpdateSettingsInput = {
  accessTokenValidatedAt?: Date;
  channelId?: string;
  credentialProvider?: "encryptedFirestore" | "env";
  displayName?: string;
  lineAccountId?: string;
  ownerUid?: string;
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
        channelId: input.channelId?.trim() ?? current.channelId,
        channelSecretRef: current.channelSecretRef,
        credentialProvider: input.credentialProvider ?? current.credentialProvider,
        displayName: input.displayName?.trim() || current.displayName,
        lineAccountId,
        ownerUid: input.ownerUid ?? current.ownerUid ?? null,
        retentionDays: nextRetentionDays,
        status: current.status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(input.accessTokenValidatedAt
          ? { accessTokenValidatedAt: input.accessTokenValidatedAt }
          : {}),
        viewerPasswordHash: input.viewerPasswordHash ?? current.viewerPasswordHash,
        viewerSharedId: input.viewerSharedId?.trim() || current.viewerSharedId,
        ...(current.createdAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

  return getLineAccount(lineAccountId);
}

export async function listActiveLineAccounts() {
  const db = getAdminDb();
  const snapshot = await db
    .collection("lineAccounts")
    .where("status", "==", "active")
    .limit(100)
    .get();
  const accounts = snapshot.docs.map((doc) => toLineAccountRecord(doc.id, doc.data()));

  if (accounts.length) {
    return accounts;
  }

  return [await getLineAccount(DEFAULT_LINE_ACCOUNT_ID)];
}

export function toLineAccountView(record: LineAccountRecord): LineAccountView {
  return {
    accessTokenValidatedAt: record.accessTokenValidatedAt,
    channelId: record.channelId,
    credentialProvider: record.credentialProvider,
    displayName: record.displayName,
    lineAccountId: record.lineAccountId,
    retentionDays: record.retentionDays,
    status: record.status,
    webhookVerifiedAt: record.webhookVerifiedAt,
  };
}

function defaultLineAccount(lineAccountId: string): LineAccountRecord {
  const useEnvDefaults = lineAccountId === DEFAULT_LINE_ACCOUNT_ID;

  return {
    accessTokenValidatedAt: null,
    channelAccessTokenRef: useEnvDefaults ? "LINE_CHANNEL_ACCESS_TOKEN" : "",
    channelId: useEnvDefaults ? process.env.LINE_CHANNEL_ID?.trim() || "" : "",
    channelSecretRef: useEnvDefaults ? "LINE_CHANNEL_SECRET" : "",
    createdAt: null,
    credentialProvider: useEnvDefaults ? "env" : "encryptedFirestore",
    displayName: useEnvDefaults ? process.env.LINE_ACCOUNT_DISPLAY_NAME?.trim() || "BB Cafe LINE" : "",
    lineAccountId,
    ownerUid: null,
    retentionDays: normalizeRetentionDays(Number(process.env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS)),
    status: "active",
    updatedAt: null,
    viewerPasswordHash: useEnvDefaults ? process.env.VIEWER_PASSWORD_HASH?.trim() || "" : "",
    viewerSharedId: useEnvDefaults ? process.env.VIEWER_SHARED_ID?.trim() || DEFAULT_VIEWER_SHARED_ID : "",
    webhookVerifiedAt: null,
  };
}

function toLineAccountRecord(lineAccountId: string, data: FirebaseFirestore.DocumentData): LineAccountRecord {
  const useEnvDefaults = lineAccountId === DEFAULT_LINE_ACCOUNT_ID;

  return {
    accessTokenValidatedAt: toIsoString(data.accessTokenValidatedAt),
    channelAccessTokenRef: String(data.channelAccessTokenRef ?? (useEnvDefaults ? "LINE_CHANNEL_ACCESS_TOKEN" : "")),
    channelId: String(data.channelId ?? (useEnvDefaults ? process.env.LINE_CHANNEL_ID ?? "" : "")),
    channelSecretRef: String(data.channelSecretRef ?? (useEnvDefaults ? "LINE_CHANNEL_SECRET" : "")),
    createdAt: toIsoString(data.createdAt),
    credentialProvider: data.credentialProvider === "encryptedFirestore" ? "encryptedFirestore" : useEnvDefaults ? "env" : "encryptedFirestore",
    displayName: String(data.displayName ?? (useEnvDefaults ? process.env.LINE_ACCOUNT_DISPLAY_NAME ?? "BB Cafe LINE" : "")),
    lineAccountId,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : null,
    retentionDays: normalizeRetentionDays(Number(data.retentionDays ?? DEFAULT_RETENTION_DAYS)),
    status: data.status === "disabled" ? "disabled" : "active",
    updatedAt: toIsoString(data.updatedAt),
    viewerPasswordHash: String(data.viewerPasswordHash ?? (useEnvDefaults ? process.env.VIEWER_PASSWORD_HASH ?? "" : "")),
    viewerSharedId: String(data.viewerSharedId ?? (useEnvDefaults ? process.env.VIEWER_SHARED_ID ?? DEFAULT_VIEWER_SHARED_ID : "")),
    webhookVerifiedAt: toIsoString(data.webhookVerifiedAt),
  };
}

function normalizeRetentionDays(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(value, 3650);
}
