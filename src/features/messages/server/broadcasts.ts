import { FieldValue, Timestamp, WriteBatch } from "firebase-admin/firestore";
import { randomHex } from "@/lib/server/crypto";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString } from "@/lib/server/firestoreUtils";
import type {
  AutomationSettingsView,
  SendRunMode,
  SendRunTargetConfirmationStatus,
  SendRunStatus,
  SendRunTargetView,
  SendRunView,
  UserInfoView,
} from "../types";
import {
  prepareSendRunTargetsForConfirmation,
  registerLatestConfirmationTargets,
} from "./confirmations";
import {
  DEFAULT_HISTORY_PAGE_LIMIT,
  encodeHistoryCursor,
  normalizeHistoryPageLimit,
  parseHistoryCursor,
} from "./historyPagination";
import { listUserInfos } from "./messages";

export const DAILY_BROADCAST_SETTINGS_ID = "dailyBroadcast";
export const DEFAULT_HISTORY_RETENTION_DAYS = 180;
export const FIXED_DAILY_SEND_TIME_JST = "07:00";
export const JAPAN_TIME_ZONE = "Asia/Tokyo";

const MAX_BROADCAST_USERS = 1000;
const MAX_SEND_RUNS = 200;
const WRITE_BATCH_LIMIT = 450;
const SEND_RUN_SUMMARY_FIELDS = [
  "createdAt",
  "expiresAt",
  "failedCount",
  "finishedAt",
  "historyRetentionDays",
  "lineAccountId",
  "messageText",
  "mode",
  "requestId",
  "runId",
  "sentAt",
  "startedAt",
  "status",
  "successCount",
  "targetCount",
  "trigger",
  "updatedAt",
];

type UpsertBroadcastUserInput = {
  firstSeenAt?: Date;
  lastMessageAt?: Date;
  lastSeenAt: Date;
  lineAccountId: string;
  userId: string;
  userName: string;
};

type SaveSendRunInput = {
  historyRetentionDays?: number;
  lineAccountId: string;
  messageText: string;
  mode: SendRunMode;
  requestId: string;
  runId?: string;
  sentAt?: Date;
  startedAt?: Date;
  targets: SendRunTargetView[];
  trigger: SendRunView["trigger"];
};

type ListSendRunsPageInput = {
  cursor?: null | string;
  limit?: number;
};

export function createManualSendRunId(date = new Date()) {
  return `send_${date.toISOString().replace(/[-:.]/g, "")}_${randomHex(4)}`;
}

export function createAutoSendRunId(lineAccountId: string, date = new Date()) {
  return `auto_${lineAccountId}_${formatDateInJapan(date)}`;
}

export function calculateSendRunStatus(successCount: number, failedCount: number): SendRunStatus {
  if (successCount > 0 && failedCount === 0) {
    return "success";
  }

  if (successCount > 0 && failedCount > 0) {
    return "partial_failed";
  }

  return "failed";
}

export function calculateSendRunExpiresAt(sentAt: Date, retentionDays = DEFAULT_HISTORY_RETENTION_DAYS) {
  return new Date(sentAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function buildAutoBroadcastPushBody(successCount: number, failedCount: number) {
  if (successCount === 0) {
    return `自動送信に失敗しました（成功0件 / 失敗${failedCount}件）`;
  }

  return `自動送信が完了しました（成功${successCount}件 / 失敗${failedCount}件）`;
}

export async function upsertBroadcastUser(input: UpsertBroadcastUserInput) {
  if (!input.userId.trim()) {
    return;
  }

  const db = getAdminDb();
  const ref = usersCollection(input.lineAccountId).doc(input.userId);
  const userName = input.userName.trim() || "不明なユーザー";
  const lastSeenAt = Timestamp.fromDate(input.lastSeenAt);
  const lastMessageAt = Timestamp.fromDate(input.lastMessageAt ?? input.lastSeenAt);
  const firstSeenAt = Timestamp.fromDate(input.firstSeenAt ?? input.lastSeenAt);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const commonFields = {
      lastMessageAt,
      lastSeenAt,
      lineAccountId: input.lineAccountId,
      updatedAt: FieldValue.serverTimestamp(),
      userId: input.userId,
      userName,
    };

    transaction.set(
      ref,
      snapshot.exists
        ? commonFields
        : {
            ...commonFields,
            broadcastSelected: false,
            createdAt: FieldValue.serverTimestamp(),
            firstSeenAt,
          },
      { merge: true },
    );
  });
}

export async function backfillBroadcastUsersFromMessages(lineAccountId: string) {
  const users = await listUserInfos(lineAccountId, MAX_BROADCAST_USERS);

  if (!users.length) {
    return 0;
  }

  const db = getAdminDb();
  const existingSnapshot = await usersCollection(lineAccountId).limit(MAX_BROADCAST_USERS).get();
  const existingIds = new Set(existingSnapshot.docs.map((doc) => doc.id));
  let written = 0;
  let batch = db.batch();
  let batchSize = 0;

  for (const user of users) {
    const ref = usersCollection(lineAccountId).doc(user.userId);
    const lastSeenAt = Timestamp.fromDate(new Date(user.lastSeenAt));
    const baseFields = {
      lastMessageAt: Timestamp.fromDate(new Date(user.lastMessageAt)),
      lastSeenAt,
      lineAccountId,
      updatedAt: FieldValue.serverTimestamp(),
      userId: user.userId,
      userName: user.userName,
    };

    batch.set(
      ref,
      existingIds.has(user.userId)
        ? baseFields
        : {
            ...baseFields,
            broadcastSelected: false,
            createdAt: FieldValue.serverTimestamp(),
            firstSeenAt: Timestamp.fromDate(new Date(user.firstSeenAt)),
          },
      { merge: true },
    );

    written += 1;
    batchSize += 1;

    if (batchSize >= WRITE_BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return written;
}

export async function listBroadcastUsers(lineAccountId: string): Promise<UserInfoView[]> {
  const snapshot = await usersCollection(lineAccountId).limit(MAX_BROADCAST_USERS).get();

  return snapshot.docs
    .map((doc) => toUserInfoView(lineAccountId, doc.id, doc.data()))
    .sort((left, right) => {
      const selectedSort = Number(right.broadcastSelected) - Number(left.broadcastSelected);

      return selectedSort || right.lastSeenAt.localeCompare(left.lastSeenAt) || left.userName.localeCompare(right.userName, "ja");
    });
}

export async function listSelectedBroadcastUsers(lineAccountId: string): Promise<UserInfoView[]> {
  const snapshot = await usersCollection(lineAccountId)
    .where("broadcastSelected", "==", true)
    .limit(MAX_BROADCAST_USERS)
    .get();

  return snapshot.docs
    .map((doc) => toUserInfoView(lineAccountId, doc.id, doc.data()))
    .sort((left, right) => left.userName.localeCompare(right.userName, "ja") || left.userId.localeCompare(right.userId));
}

export async function countSelectedBroadcastUsers(lineAccountId: string) {
  const snapshot = await usersCollection(lineAccountId)
    .where("broadcastSelected", "==", true)
    .count()
    .get();

  return snapshot.data().count;
}

export async function updateBroadcastUserSelection({
  lineAccountId,
  selected,
  userId,
}: {
  lineAccountId: string;
  selected: boolean;
  userId: string;
}) {
  const ref = usersCollection(lineAccountId).doc(userId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return null;
  }

  await ref.set(
    {
      broadcastSelected: selected,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const nextSnapshot = await ref.get();

  return toUserInfoView(lineAccountId, nextSnapshot.id, nextSnapshot.data() ?? {});
}

export async function getDailyBroadcastSettings(lineAccountId: string): Promise<AutomationSettingsView> {
  const snapshot = await automationSettingsRef(lineAccountId).get();

  if (!snapshot.exists) {
    return defaultDailyBroadcastSettings(lineAccountId);
  }

  return toDailyBroadcastSettings(lineAccountId, snapshot.data() ?? {});
}

export async function updateDailyBroadcastSettings({
  enabled,
  historyRetentionDays,
  lineAccountId,
}: {
  enabled?: boolean;
  historyRetentionDays?: number;
  lineAccountId: string;
}) {
  const current = await getDailyBroadcastSettings(lineAccountId);
  const nextHistoryRetentionDays = normalizeHistoryRetentionDays(
    historyRetentionDays ?? current.historyRetentionDays,
  );

  await automationSettingsRef(lineAccountId).set(
    {
      enabled: typeof enabled === "boolean" ? enabled : current.enabled,
      historyRetentionDays: nextHistoryRetentionDays,
      lineAccountId,
      scheduleMode: "fixed_deploy",
      sendTimeJst: FIXED_DAILY_SEND_TIME_JST,
      timeZone: JAPAN_TIME_ZONE,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return getDailyBroadcastSettings(lineAccountId);
}

export async function getSendRun(lineAccountId: string, runId: string) {
  const snapshot = await sendRunsCollection(lineAccountId).doc(runId).get();

  return snapshot.exists ? toSendRunView(lineAccountId, snapshot.id, snapshot.data() ?? {}) : null;
}

export async function reserveAutoSendRun({
  historyRetentionDays,
  lineAccountId,
  requestId,
  runId,
  startedAt = new Date(),
}: {
  historyRetentionDays?: number;
  lineAccountId: string;
  requestId: string;
  runId: string;
  startedAt?: Date;
}) {
  const retentionDays = normalizeHistoryRetentionDays(historyRetentionDays);

  try {
    await sendRunsCollection(lineAccountId)
      .doc(runId)
      .create({
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(calculateSendRunExpiresAt(startedAt, retentionDays)),
        failedCount: 0,
        finishedAt: null,
        historyRetentionDays: retentionDays,
        lineAccountId,
        messageText: "",
        mode: "auto",
        requestId,
        runId,
        sentAt: Timestamp.fromDate(startedAt),
        startedAt: Timestamp.fromDate(startedAt),
        status: "failed",
        successCount: 0,
        targetCount: 0,
        targets: [],
        trigger: "cron",
        updatedAt: FieldValue.serverTimestamp(),
      });

    return true;
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return false;
    }

    throw error;
  }
}

export async function saveSendRun(input: SaveSendRunInput) {
  const sentAt = input.sentAt ?? new Date();
  const startedAt = input.startedAt ?? sentAt;
  const historyRetentionDays = normalizeHistoryRetentionDays(input.historyRetentionDays);
  const targets = prepareSendRunTargetsForConfirmation(input.targets);
  const successCount = targets.filter((target) => target.status === "success").length;
  const failedCount = targets.filter((target) => target.status === "failed").length;
  const status = calculateSendRunStatus(successCount, failedCount);
  const runId = input.runId ?? createManualSendRunId(sentAt);
  const ref = sendRunsCollection(input.lineAccountId).doc(runId);

  await ref.set(
    {
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(calculateSendRunExpiresAt(sentAt, historyRetentionDays)),
      failedCount,
      finishedAt: FieldValue.serverTimestamp(),
      historyRetentionDays,
      lineAccountId: input.lineAccountId,
      messageText: input.messageText,
      mode: input.mode,
      requestId: input.requestId,
      runId,
      sentAt: Timestamp.fromDate(sentAt),
      startedAt: Timestamp.fromDate(startedAt),
      status,
      successCount,
      targetCount: targets.length,
      targets,
      trigger: input.trigger,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: false },
  );

  await registerLatestConfirmationTargets({
    lineAccountId: input.lineAccountId,
    mode: input.mode,
    runId,
    sentAt,
    targets,
  });

  return getSendRun(input.lineAccountId, runId);
}

function isAlreadyExistsError(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;

    if (code === 6 || code === "already-exists") {
      return true;
    }
  }

  return error instanceof Error && error.message.toLowerCase().includes("already exists");
}

function isMissingIndexError(error: unknown) {
  return error instanceof Error && error.message.includes("FAILED_PRECONDITION");
}

export async function listSendRuns(lineAccountId: string, limit = 100): Promise<SendRunView[]> {
  const snapshot = await sendRunsCollection(lineAccountId)
    .orderBy("sentAt", "desc")
    .limit(normalizeSendRunLimit(limit))
    .select(...SEND_RUN_SUMMARY_FIELDS)
    .get();

  return snapshot.docs.map((doc) => toSendRunView(lineAccountId, doc.id, doc.data()));
}

export async function listSendRunsPage(
  lineAccountId: string,
  { cursor = null, limit = DEFAULT_HISTORY_PAGE_LIMIT }: ListSendRunsPageInput = {},
) {
  const normalizedLimit = normalizeHistoryPageLimit(limit);
  let query: FirebaseFirestore.Query = sendRunsCollection(lineAccountId).orderBy("sentAt", "desc");
  const parsedCursor = parseHistoryCursor(cursor);

  if (parsedCursor) {
    query = query.startAfter(parsedCursor);
  }

  const snapshot = await query
    .limit(normalizedLimit + 1)
    .select(...SEND_RUN_SUMMARY_FIELDS)
    .get();
  const runs = snapshot.docs
    .map((doc) => toSendRunView(lineAccountId, doc.id, doc.data()))
    .sort((left, right) => right.sentAt.localeCompare(left.sentAt) || right.runId.localeCompare(left.runId));
  const pageRuns = runs.slice(0, normalizedLimit);
  const lastRun = pageRuns.at(-1);

  return {
    nextCursor: runs.length > normalizedLimit && lastRun ? encodeHistoryCursor(lastRun.sentAt) : null,
    runs: pageRuns,
  };
}

export async function listAutoSendRuns(lineAccountId: string, limit = 20): Promise<SendRunView[]> {
  const normalizedLimit = normalizeSendRunLimit(limit);

  try {
    const snapshot = await sendRunsCollection(lineAccountId)
      .where("mode", "==", "auto")
      .orderBy("sentAt", "desc")
      .limit(normalizedLimit)
      .select(...SEND_RUN_SUMMARY_FIELDS)
      .get();

    return snapshot.docs.map((doc) => toSendRunView(lineAccountId, doc.id, doc.data()));
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }

    const snapshot = await sendRunsCollection(lineAccountId)
      .where("mode", "==", "auto")
      .limit(normalizedLimit)
      .select(...SEND_RUN_SUMMARY_FIELDS)
      .get();

    return snapshot.docs
      .map((doc) => toSendRunView(lineAccountId, doc.id, doc.data()))
      .sort((left, right) => right.sentAt.localeCompare(left.sentAt) || right.runId.localeCompare(left.runId));
  }
}

export async function deleteExpiredSendRuns(lineAccountId: string, now = new Date()) {
  const snapshot = await sendRunsCollection(lineAccountId)
    .where("expiresAt", "<=", Timestamp.fromDate(now))
    .limit(MAX_SEND_RUNS)
    .get();

  if (snapshot.empty) {
    return {
      deletedCount: 0,
      failedCount: 0,
    };
  }

  const db = getAdminDb();
  const batches: WriteBatch[] = [];

  for (let index = 0; index < snapshot.docs.length; index += WRITE_BATCH_LIMIT) {
    const batch = db.batch();

    snapshot.docs.slice(index, index + WRITE_BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
    batches.push(batch);
  }

  let failedCount = 0;

  for (const batch of batches) {
    try {
      await batch.commit();
    } catch {
      failedCount += 1;
    }
  }

  return {
    deletedCount: failedCount ? 0 : snapshot.size,
    failedCount,
  };
}

function usersCollection(lineAccountId: string) {
  return getAdminDb().collection("lineAccounts").doc(lineAccountId).collection("users");
}

function automationSettingsRef(lineAccountId: string) {
  return getAdminDb()
    .collection("lineAccounts")
    .doc(lineAccountId)
    .collection("automationSettings")
    .doc(DAILY_BROADCAST_SETTINGS_ID);
}

function sendRunsCollection(lineAccountId: string) {
  return getAdminDb().collection("lineAccounts").doc(lineAccountId).collection("sendRuns");
}

function defaultDailyBroadcastSettings(lineAccountId: string): AutomationSettingsView {
  return {
    enabled: false,
    historyRetentionDays: DEFAULT_HISTORY_RETENTION_DAYS,
    lineAccountId,
    scheduleMode: "fixed_deploy",
    sendTimeJst: FIXED_DAILY_SEND_TIME_JST,
    timeZone: JAPAN_TIME_ZONE,
    updatedAt: null,
  };
}

function normalizeHistoryRetentionDays(value = DEFAULT_HISTORY_RETENTION_DAYS) {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_HISTORY_RETENTION_DAYS;
  }

  return Math.min(value, 3650);
}

function normalizeSendRunLimit(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    return 100;
  }

  return Math.min(value, MAX_SEND_RUNS);
}

function formatDateInJapan(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine Japan date.");
  }

  return `${year}${month}${day}`;
}

function toDailyBroadcastSettings(
  lineAccountId: string,
  data: FirebaseFirestore.DocumentData,
): AutomationSettingsView {
  return {
    enabled: Boolean(data.enabled),
    historyRetentionDays: normalizeHistoryRetentionDays(Number(data.historyRetentionDays ?? DEFAULT_HISTORY_RETENTION_DAYS)),
    lineAccountId,
    scheduleMode: "fixed_deploy",
    sendTimeJst: FIXED_DAILY_SEND_TIME_JST,
    timeZone: JAPAN_TIME_ZONE,
    updatedAt: toIsoString(data.updatedAt),
  };
}

function toUserInfoView(
  lineAccountId: string,
  userId: string,
  data: FirebaseFirestore.DocumentData,
): UserInfoView {
  const lastSeenAt = toIsoString(data.lastSeenAt) ?? toIsoString(data.fetchedAt) ?? new Date(0).toISOString();
  const firstSeenAt = toIsoString(data.firstSeenAt) ?? lastSeenAt;
  const lastMessageAt = toIsoString(data.lastMessageAt) ?? lastSeenAt;

  return {
    broadcastSelected: Boolean(data.broadcastSelected),
    fetchedAt: lastSeenAt,
    firstSeenAt,
    lastMessageAt,
    lastSeenAt,
    lineAccountId: String(data.lineAccountId ?? lineAccountId),
    userId: String(data.userId ?? userId),
    userName: String(data.userName ?? "不明なユーザー"),
  };
}

function toSendRunView(
  lineAccountId: string,
  runId: string,
  data: FirebaseFirestore.DocumentData,
): SendRunView {
  const targets = Array.isArray(data.targets) ? data.targets.map(toSendRunTargetView) : [];
  const successCount = Number(data.successCount ?? targets.filter((target) => target.status === "success").length);
  const failedCount = Number(data.failedCount ?? targets.filter((target) => target.status === "failed").length);

  return {
    createdAt: toIsoString(data.createdAt),
    expiresAt: toIsoString(data.expiresAt) ?? new Date(0).toISOString(),
    failedCount,
    finishedAt: toIsoString(data.finishedAt),
    historyRetentionDays: normalizeHistoryRetentionDays(Number(data.historyRetentionDays ?? DEFAULT_HISTORY_RETENTION_DAYS)),
    lineAccountId: String(data.lineAccountId ?? lineAccountId),
    messageText: String(data.messageText ?? ""),
    mode: data.mode === "auto" ? "auto" : "manual",
    requestId: String(data.requestId ?? ""),
    runId: String(data.runId ?? runId),
    sentAt: toIsoString(data.sentAt) ?? new Date(0).toISOString(),
    startedAt: toIsoString(data.startedAt) ?? new Date(0).toISOString(),
    status: normalizeSendRunStatus(data.status, successCount, failedCount),
    successCount,
    targetCount: Number(data.targetCount ?? targets.length),
    targets,
    trigger: data.trigger === "cron" ? "cron" : "viewer",
    updatedAt: toIsoString(data.updatedAt),
  };
}

function toSendRunTargetView(value: unknown): SendRunTargetView {
  const data = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const status = data.status === "failed" ? "failed" : "success";
  const httpStatus = Number(data.httpStatus);

  return {
    confirmationStatus: normalizeTargetConfirmationStatus(data.confirmationStatus, status),
    confirmedAt: toIsoString(data.confirmedAt),
    ...(typeof data.errorCode === "string" ? { errorCode: data.errorCode } : {}),
    ...(Number.isInteger(httpStatus) ? { httpStatus } : {}),
    reminderSentAt: toIsoString(data.reminderSentAt),
    status,
    userId: String(data.userId ?? ""),
    userName: String(data.userName ?? "不明なユーザー"),
  };
}

function normalizeTargetConfirmationStatus(
  value: unknown,
  sendStatus: SendRunTargetView["status"],
): SendRunTargetConfirmationStatus {
  if (value === "confirmed" || value === "pending" || value === "reminded" || value === "not_required") {
    return value;
  }

  return sendStatus === "success" ? "not_required" : "not_required";
}

function normalizeSendRunStatus(value: unknown, successCount: number, failedCount: number): SendRunStatus {
  if (value === "success" || value === "partial_failed" || value === "failed") {
    return value;
  }

  return calculateSendRunStatus(successCount, failedCount);
}
