import { randomBytes } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString } from "@/lib/server/firestoreUtils";
import type {
  ConfirmationCheckTargetView,
  ConfirmationReminderRunView,
  SendRunMode,
  SendRunTargetConfirmationStatus,
  SendRunTargetView,
} from "../types";

export const CONFIRMATION_BUTTON_LABEL = "確認したよ👍";

const CONFIRMATION_ACTION = "confirm_message";
const CONFIRMATION_QUICK_REPLY_ICON_PATH = "/line/confirm-quick-reply.png";
const CONFIRMATION_REMINDER_RUNS_COLLECTION = "confirmationReminderRuns";
const CONFIRMATION_TARGETS_COLLECTION = "confirmationTargets";
const MAX_CONFIRMATION_REMINDERS = 1000;
const MAX_CONFIRMATION_REMINDER_RUNS = 100;

type RegisterConfirmationTargetsInput = {
  lineAccountId: string;
  mode: SendRunMode;
  runId: string;
  sentAt: Date;
  targets: SendRunTargetView[];
};

type ConfirmationPostbackInput = {
  lineAccountId: string;
  postbackData: string;
  sourceUserId: null | string;
};

type SaveConfirmationReminderRunInput = {
  confirmedCount: number;
  confirmedTargets: ConfirmationCheckTargetView[];
  failedCount: number;
  finishedAt: Date;
  lineAccountId: string;
  notifiedCount: number;
  runId: string;
  skippedReason: null | string;
  startedAt: Date;
  status: ConfirmationReminderRunView["status"];
  targetCount: number;
  unconfirmedCount: number;
  unconfirmedTargets: ConfirmationCheckTargetView[];
};

export type ConfirmationTargetRecord = {
  confirmedAt: null | string;
  lineAccountId: string;
  mode: SendRunMode;
  reminderSentAt: null | string;
  runId: string;
  sentAt: string;
  status: Exclude<SendRunTargetConfirmationStatus, "not_required">;
  userId: string;
  userName: string;
};

export function buildConfirmationPostbackData({
  runId,
  userId,
}: {
  runId: string;
  userId: string;
}) {
  const params = new URLSearchParams({
    action: CONFIRMATION_ACTION,
    runId,
    userId,
  });

  return params.toString();
}

export function buildConfirmationQuickReply({
  iconBaseUrl = getConfirmationQuickReplyIconBaseUrl(),
  runId,
  userId,
}: {
  iconBaseUrl?: null | string;
  runId: string;
  userId: string;
}) {
  const imageUrl = buildConfirmationQuickReplyIconUrl(iconBaseUrl);

  return {
    items: [
      {
        ...(imageUrl ? { imageUrl } : {}),
        action: {
          data: buildConfirmationPostbackData({ runId, userId }),
          displayText: CONFIRMATION_BUTTON_LABEL,
          label: CONFIRMATION_BUTTON_LABEL,
          type: "postback",
        },
        type: "action",
      },
    ],
  };
}

export function buildConfirmationQuickReplyIconUrl(baseUrl = getConfirmationQuickReplyIconBaseUrl()) {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(CONFIRMATION_QUICK_REPLY_ICON_PATH, normalizeHttpsBaseUrl(baseUrl));

    return url.toString();
  } catch {
    return null;
  }
}

export function prepareSendRunTargetsForConfirmation(targets: SendRunTargetView[]) {
  return targets.map((target) => ({
    ...target,
    confirmationStatus:
      target.confirmationStatus ?? (target.status === "success" ? "pending" : "not_required"),
    confirmedAt: target.confirmedAt ?? null,
    reminderSentAt: target.reminderSentAt ?? null,
  }));
}

export async function registerLatestConfirmationTargets(input: RegisterConfirmationTargetsInput) {
  const successTargets = input.targets.filter((target) => target.status === "success");

  if (!successTargets.length) {
    return 0;
  }

  const db = getAdminDb();
  let batch = db.batch();
  let batchSize = 0;
  let written = 0;

  for (const target of successTargets) {
    const ref = confirmationTargetRef(input.lineAccountId, target.userId);

    batch.set(ref, {
      confirmedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      lineAccountId: input.lineAccountId,
      mode: input.mode,
      reminderSentAt: null,
      runId: input.runId,
      sentAt: Timestamp.fromDate(input.sentAt),
      status: "pending",
      updatedAt: FieldValue.serverTimestamp(),
      userId: target.userId,
      userName: target.userName,
    });

    batchSize += 1;
    written += 1;

    if (batchSize >= 450) {
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

export async function markConfirmationFromPostback(input: ConfirmationPostbackInput) {
  const parsed = parseConfirmationPostbackData(input.postbackData);

  if (!parsed || parsed.userId !== input.sourceUserId) {
    return {
      confirmed: false,
      reason: "invalid_postback" as const,
    };
  }

  const confirmedAt = new Date();
  const db = getAdminDb();
  const runRef = sendRunRef(input.lineAccountId, parsed.runId);
  const targetRef = confirmationTargetRef(input.lineAccountId, parsed.userId);

  return db.runTransaction(async (transaction) => {
    const [runSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(runRef),
      transaction.get(targetRef),
    ]);
    let runTargetUpdated = false;

    if (runSnapshot.exists) {
      const data = runSnapshot.data() ?? {};
      const targets = Array.isArray(data.targets) ? data.targets : [];
      const nextTargets = targets.map((value) => {
        const target = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

        if (String(target.userId ?? "") !== parsed.userId || target.status === "failed") {
          return value;
        }

        runTargetUpdated = true;

        return {
          ...target,
          confirmationStatus: "confirmed",
          confirmedAt: Timestamp.fromDate(confirmedAt),
          reminderSentAt: target.reminderSentAt ?? null,
        };
      });

      if (runTargetUpdated) {
        transaction.update(runRef, {
          targets: nextTargets,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (targetSnapshot.exists && targetSnapshot.data()?.runId === parsed.runId) {
      transaction.update(targetRef, {
        confirmedAt: Timestamp.fromDate(confirmedAt),
        status: "confirmed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      confirmed: runTargetUpdated,
      reason: runTargetUpdated ? null : "target_not_found" as const,
      runId: parsed.runId,
      userId: parsed.userId,
    };
  });
}

export async function listPendingConfirmationTargets(lineAccountId: string) {
  const snapshot = await confirmationTargetsCollection(lineAccountId)
    .where("status", "==", "pending")
    .limit(MAX_CONFIRMATION_REMINDERS)
    .get();

  return snapshot.docs
    .map((doc) => toConfirmationTargetRecord(lineAccountId, doc.id, doc.data()))
    .sort((left, right) => left.userName.localeCompare(right.userName, "ja") || left.userId.localeCompare(right.userId));
}

export async function listConfirmationTargets(lineAccountId: string) {
  const snapshot = await confirmationTargetsCollection(lineAccountId)
    .limit(MAX_CONFIRMATION_REMINDERS)
    .get();

  return snapshot.docs
    .map((doc) => toConfirmationTargetRecord(lineAccountId, doc.id, doc.data()))
    .sort((left, right) => left.userName.localeCompare(right.userName, "ja") || left.userId.localeCompare(right.userId));
}

export async function listUnconfirmedConfirmationTargets(lineAccountId: string) {
  const snapshot = await confirmationTargetsCollection(lineAccountId)
    .where("status", "in", ["pending", "reminded"])
    .limit(MAX_CONFIRMATION_REMINDERS)
    .get();

  return snapshot.docs
    .map((doc) => toConfirmationTargetRecord(lineAccountId, doc.id, doc.data()))
    .sort(
      (left, right) =>
        right.sentAt.localeCompare(left.sentAt) ||
        left.userName.localeCompare(right.userName, "ja") ||
        left.userId.localeCompare(right.userId),
    );
}

export async function markUnconfirmedConfirmationTargetsConfirmed(lineAccountId: string) {
  const targets = await listUnconfirmedConfirmationTargets(lineAccountId);

  if (!targets.length) {
    return 0;
  }

  const confirmedAt = new Date();
  const db = getAdminDb();
  let batch = db.batch();
  let batchSize = 0;

  for (const target of targets) {
    batch.update(confirmationTargetRef(lineAccountId, target.userId), {
      confirmedAt: Timestamp.fromDate(confirmedAt),
      status: "confirmed",
      updatedAt: FieldValue.serverTimestamp(),
    });

    batchSize += 1;

    if (batchSize >= 450) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  await markSendRunTargetsConfirmed(lineAccountId, targets, confirmedAt);

  return targets.length;
}

export function buildConfirmationCheckSnapshot(targets: ConfirmationTargetRecord[]) {
  const confirmedTargets = targets
    .filter((target) => target.status === "confirmed")
    .map((target) => toConfirmationCheckTargetView(target, "confirmed"));
  const unconfirmedTargets = targets
    .filter((target) => target.status !== "confirmed")
    .map((target) => toConfirmationCheckTargetView(target, "unconfirmed"));

  return {
    confirmedCount: confirmedTargets.length,
    confirmedTargets,
    targetCount: targets.length,
    unconfirmedCount: unconfirmedTargets.length,
    unconfirmedTargets,
  };
}

export function buildUnconfirmedReminderPushBody(targets: ConfirmationTargetRecord[]) {
  if (!targets.length) {
    return "";
  }

  const [first, ...rest] = targets;

  if (!rest.length) {
    return `${first.userName}さんに未確認メッセージがあります`;
  }

  return `${first.userName}さんほか${rest.length}名に未確認メッセージがあります`;
}

export async function markReminderSentForTargets(lineAccountId: string, targets: ConfirmationTargetRecord[]) {
  if (!targets.length) {
    return 0;
  }

  const remindedAt = new Date();
  const db = getAdminDb();
  const batch = db.batch();

  targets.forEach((target) => {
    batch.update(confirmationTargetRef(lineAccountId, target.userId), {
      reminderSentAt: Timestamp.fromDate(remindedAt),
      status: "reminded",
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  await markSendRunTargetsReminded(lineAccountId, targets, remindedAt);

  return targets.length;
}

export function createConfirmationReminderRunId(startedAt = new Date()) {
  return `confirm_${startedAt.toISOString().replace(/[-:.]/g, "")}_${randomHex(4)}`;
}

export async function saveConfirmationReminderRun(input: SaveConfirmationReminderRunInput) {
  await confirmationReminderRunsCollection(input.lineAccountId).doc(input.runId).set({
    confirmedCount: input.confirmedCount,
    confirmedTargets: input.confirmedTargets,
    createdAt: FieldValue.serverTimestamp(),
    failedCount: input.failedCount,
    finishedAt: Timestamp.fromDate(input.finishedAt),
    lineAccountId: input.lineAccountId,
    notifiedCount: input.notifiedCount,
    runId: input.runId,
    skippedReason: input.skippedReason,
    startedAt: Timestamp.fromDate(input.startedAt),
    status: input.status,
    targetCount: input.targetCount,
    unconfirmedCount: input.unconfirmedCount,
    unconfirmedTargets: input.unconfirmedTargets,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listConfirmationReminderRuns(lineAccountId: string, limit = 20) {
  const snapshot = await confirmationReminderRunsCollection(lineAccountId)
    .orderBy("startedAt", "desc")
    .limit(normalizeLimit(limit, MAX_CONFIRMATION_REMINDER_RUNS))
    .get();

  return snapshot.docs.map((doc) => toConfirmationReminderRunView(lineAccountId, doc.id, doc.data()));
}

function parseConfirmationPostbackData(data: string) {
  const params = new URLSearchParams(data);

  if (params.get("action") !== CONFIRMATION_ACTION) {
    return null;
  }

  const runId = params.get("runId")?.trim() ?? "";
  const userId = params.get("userId")?.trim() ?? "";

  if (!runId || !userId) {
    return null;
  }

  return {
    runId,
    userId,
  };
}

async function markSendRunTargetsReminded(
  lineAccountId: string,
  targets: ConfirmationTargetRecord[],
  remindedAt: Date,
) {
  const targetsByRunId = new Map<string, Set<string>>();

  targets.forEach((target) => {
    const userIds = targetsByRunId.get(target.runId) ?? new Set<string>();

    userIds.add(target.userId);
    targetsByRunId.set(target.runId, userIds);
  });

  for (const [runId, userIds] of targetsByRunId) {
    const ref = sendRunRef(lineAccountId, runId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      continue;
    }

    const data = snapshot.data() ?? {};
    const currentTargets = Array.isArray(data.targets) ? data.targets : [];
    let changed = false;
    const nextTargets = currentTargets.map((value) => {
      const target = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

      if (!userIds.has(String(target.userId ?? "")) || target.confirmationStatus === "confirmed") {
        return value;
      }

      changed = true;

      return {
        ...target,
        confirmationStatus: "reminded",
        confirmedAt: target.confirmedAt ?? null,
        reminderSentAt: Timestamp.fromDate(remindedAt),
      };
    });

    if (changed) {
      await ref.update({
        targets: nextTargets,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

async function markSendRunTargetsConfirmed(
  lineAccountId: string,
  targets: ConfirmationTargetRecord[],
  confirmedAt: Date,
) {
  const targetsByRunId = new Map<string, Set<string>>();

  targets.forEach((target) => {
    const userIds = targetsByRunId.get(target.runId) ?? new Set<string>();

    userIds.add(target.userId);
    targetsByRunId.set(target.runId, userIds);
  });

  for (const [runId, userIds] of targetsByRunId) {
    const ref = sendRunRef(lineAccountId, runId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      continue;
    }

    const data = snapshot.data() ?? {};
    const currentTargets = Array.isArray(data.targets) ? data.targets : [];
    let changed = false;
    const nextTargets = currentTargets.map((value) => {
      const target = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

      if (!userIds.has(String(target.userId ?? "")) || target.status === "failed") {
        return value;
      }

      changed = true;

      return {
        ...target,
        confirmationStatus: "confirmed",
        confirmedAt: Timestamp.fromDate(confirmedAt),
        reminderSentAt: target.reminderSentAt ?? null,
      };
    });

    if (changed) {
      await ref.update({
        targets: nextTargets,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

function confirmationTargetsCollection(lineAccountId: string) {
  return getAdminDb()
    .collection("lineAccounts")
    .doc(lineAccountId)
    .collection(CONFIRMATION_TARGETS_COLLECTION);
}

function confirmationTargetRef(lineAccountId: string, userId: string) {
  return confirmationTargetsCollection(lineAccountId).doc(userId);
}

function confirmationReminderRunsCollection(lineAccountId: string) {
  return getAdminDb()
    .collection("lineAccounts")
    .doc(lineAccountId)
    .collection(CONFIRMATION_REMINDER_RUNS_COLLECTION);
}

function sendRunRef(lineAccountId: string, runId: string) {
  return getAdminDb()
    .collection("lineAccounts")
    .doc(lineAccountId)
    .collection("sendRuns")
    .doc(runId);
}

function toConfirmationTargetRecord(
  lineAccountId: string,
  userId: string,
  data: FirebaseFirestore.DocumentData,
): ConfirmationTargetRecord {
  return {
    confirmedAt: toIsoString(data.confirmedAt),
    lineAccountId: String(data.lineAccountId ?? lineAccountId),
    mode: data.mode === "auto" ? "auto" : "manual",
    reminderSentAt: toIsoString(data.reminderSentAt),
    runId: String(data.runId ?? ""),
    sentAt: toIsoString(data.sentAt) ?? new Date(0).toISOString(),
    status: normalizeConfirmationStatus(data.status),
    userId: String(data.userId ?? userId),
    userName: String(data.userName ?? "不明なユーザー"),
  };
}

function normalizeConfirmationStatus(value: unknown): ConfirmationTargetRecord["status"] {
  if (value === "confirmed" || value === "reminded") {
    return value;
  }

  return "pending";
}

function toConfirmationCheckTargetView(
  target: ConfirmationTargetRecord,
  status: ConfirmationCheckTargetView["status"],
): ConfirmationCheckTargetView {
  return {
    confirmedAt: target.confirmedAt,
    reminderSentAt: target.reminderSentAt,
    status,
    userId: target.userId,
    userName: target.userName,
  };
}

function toConfirmationReminderRunView(
  lineAccountId: string,
  runId: string,
  data: FirebaseFirestore.DocumentData,
): ConfirmationReminderRunView {
  const confirmedTargets = toConfirmationCheckTargetViews(data.confirmedTargets, "confirmed");
  const unconfirmedTargets = toConfirmationCheckTargetViews(data.unconfirmedTargets, "unconfirmed");

  return {
    confirmedCount: Number(data.confirmedCount ?? confirmedTargets.length),
    confirmedTargets,
    failedCount: Number(data.failedCount ?? 0),
    finishedAt: toIsoString(data.finishedAt),
    lineAccountId: String(data.lineAccountId ?? lineAccountId),
    notifiedCount: Number(data.notifiedCount ?? 0),
    runId: String(data.runId ?? runId),
    skippedReason: typeof data.skippedReason === "string" ? data.skippedReason : null,
    startedAt: toIsoString(data.startedAt) ?? new Date(0).toISOString(),
    status: normalizeReminderRunStatus(data.status),
    targetCount: Number(data.targetCount ?? 0),
    unconfirmedCount: Number(data.unconfirmedCount ?? data.targetCount ?? unconfirmedTargets.length),
    unconfirmedTargets,
  };
}

function toConfirmationCheckTargetViews(
  value: unknown,
  status: ConfirmationCheckTargetView["status"],
): ConfirmationCheckTargetView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const data = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};

    return {
      confirmedAt: typeof data.confirmedAt === "string" ? data.confirmedAt : null,
      reminderSentAt: typeof data.reminderSentAt === "string" ? data.reminderSentAt : null,
      status,
      userId: String(data.userId ?? ""),
      userName: String(data.userName ?? "不明なユーザー"),
    };
  });
}

function normalizeReminderRunStatus(value: unknown): ConfirmationReminderRunView["status"] {
  if (value === "failed" || value === "partial_failed" || value === "skipped" || value === "success") {
    return value;
  }

  return "failed";
}

function normalizeLimit(value: number, max: number) {
  if (!Number.isInteger(value) || value < 1) {
    return 20;
  }

  return Math.min(value, max);
}

function randomHex(bytes: number) {
  return randomBytes(bytes).toString("hex");
}

function getConfirmationQuickReplyIconBaseUrl() {
  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (appBaseUrl) {
    return appBaseUrl;
  }

  const vercelProjectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (vercelProjectProductionUrl) {
    return vercelProjectProductionUrl;
  }

  return process.env.VERCEL_URL?.trim() || null;
}

function normalizeHttpsBaseUrl(value: string) {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "https:") {
    throw new Error("Confirmation quick reply icon URL must use HTTPS.");
  }

  return url;
}
