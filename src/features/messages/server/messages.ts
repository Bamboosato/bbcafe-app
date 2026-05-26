import { FieldValue, Timestamp, WriteBatch } from "firebase-admin/firestore";
import { randomHex, stableHash } from "@/lib/server/crypto";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString, toTimestamp } from "@/lib/server/firestoreUtils";
import type { CronRunView, MessageView, SourceType } from "../types";

const PROTECTED_RECENT_COUNT = 1000;
const MAX_DAILY_DELETE_COUNT = 10000;

type SaveTextMessageInput = {
  expiresAt: Date;
  lineAccountId: string;
  lineMessageId: string;
  receivedAt: Date;
  senderDisplayName: string;
  sentAt: Date;
  sourceGroupId: null | string;
  sourceGroupName: null | string;
  sourceType: SourceType;
  sourceUserId: null | string;
  text: string;
  webhookEventId: string;
};

type MessageRecord = MessageView & {
  createdAt: null | string;
  lineMessageId: string;
  receivedAt: string;
  sourceUserId: null | string;
  webhookEventId: string;
};

export async function saveTextMessage(input: SaveTextMessageInput) {
  const db = getAdminDb();
  const messageId = `msg_${stableHash(input.webhookEventId).slice(0, 32)}`;
  const ref = db.collection("messages").doc(messageId);
  let created = false;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (snapshot.exists) {
      return;
    }

    created = true;
    transaction.set(ref, {
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(input.expiresAt),
      lineAccountId: input.lineAccountId,
      lineMessageId: input.lineMessageId,
      messageId,
      messageType: "text",
      receivedAt: Timestamp.fromDate(input.receivedAt),
      senderDisplayName: input.senderDisplayName,
      sentAt: Timestamp.fromDate(input.sentAt),
      sourceGroupId: input.sourceGroupId,
      sourceGroupName: input.sourceGroupName,
      sourceType: input.sourceType,
      sourceUserId: input.sourceUserId,
      text: input.text,
      webhookEventId: input.webhookEventId,
    });
  });

  return {
    created,
    messageId,
  };
}

export async function deleteMessagesByLineMessageId(lineAccountId: string, lineMessageId: string) {
  const db = getAdminDb();
  const snapshot = await db
    .collection("messages")
    .where("lineAccountId", "==", lineAccountId)
    .where("lineMessageId", "==", lineMessageId)
    .limit(20)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();

  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  return snapshot.size;
}

export async function deleteMessage(lineAccountId: string, messageId: string) {
  const db = getAdminDb();
  const ref = db.collection("messages").doc(messageId);
  const snapshot = await ref.get();

  if (!snapshot.exists || snapshot.data()?.lineAccountId !== lineAccountId) {
    return false;
  }

  await ref.delete();

  return true;
}

export async function listVisibleMessages(lineAccountId: string, limit = 100) {
  const db = getAdminDb();
  const now = Timestamp.now();
  const normalizedLimit = normalizeLimit(limit);
  const recentSnapshot = await getRecentMessagesSnapshot(lineAccountId, PROTECTED_RECENT_COUNT);
  const records = new Map<string, MessageRecord>();

  for (const doc of recentSnapshot.docs) {
    records.set(doc.id, toMessageRecord(doc.id, doc.data()));
  }

  if (recentSnapshot.size >= PROTECTED_RECENT_COUNT) {
    const unexpiredSnapshot = await db
      .collection("messages")
      .where("lineAccountId", "==", lineAccountId)
      .where("expiresAt", ">", now)
      .orderBy("expiresAt", "desc")
      .limit(PROTECTED_RECENT_COUNT)
      .get();

    for (const doc of unexpiredSnapshot.docs) {
      records.set(doc.id, toMessageRecord(doc.id, doc.data()));
    }
  }

  return [...records.values()]
    .sort((left, right) => right.sentAt.localeCompare(left.sentAt) || right.messageId.localeCompare(left.messageId))
    .slice(0, normalizedLimit)
    .map(toMessageView);
}

export async function getVisibleMessage(lineAccountId: string, messageId: string) {
  const db = getAdminDb();
  const snapshot = await db.collection("messages").doc(messageId).get();

  if (!snapshot.exists || snapshot.data()?.lineAccountId !== lineAccountId) {
    return null;
  }

  const record = toMessageRecord(snapshot.id, snapshot.data() ?? {});
  const expiresAt = Date.parse(record.expiresAt);

  if (!Number.isNaN(expiresAt) && expiresAt > Date.now()) {
    return toMessageView(record);
  }

  const recentSnapshot = await getRecentMessagesSnapshot(lineAccountId, PROTECTED_RECENT_COUNT);

  return recentSnapshot.docs.some((doc) => doc.id === messageId) ? toMessageView(record) : null;
}

export async function runExpiredMessageDeletion(lineAccountId: string) {
  const db = getAdminDb();
  const startedAt = new Date();
  const runId = `cron_${startedAt.toISOString().replace(/[-:.]/g, "")}_${randomHex(4)}`;
  let deletedCount = 0;
  let failedCount = 0;
  let skippedReason: null | string = null;
  let status: CronRunView["status"] = "success";

  try {
    const recentSnapshot = await db
      .collection("messages")
      .where("lineAccountId", "==", lineAccountId)
      .orderBy("sentAt", "desc")
      .limit(PROTECTED_RECENT_COUNT + 1)
      .get();

    if (recentSnapshot.size <= PROTECTED_RECENT_COUNT) {
      skippedReason = "protected_recent_count_not_exceeded";
      status = "skipped";
      await writeCronRun({
        deletedCount,
        failedCount,
        protectedCount: recentSnapshot.size,
        runId,
        skippedReason,
        startedAt,
        status,
      });
      return {
        deletedCount,
        failedCount,
        protectedCount: recentSnapshot.size,
        runId,
        skippedReason,
        status,
      };
    }

    const protectedDocs = recentSnapshot.docs.slice(0, PROTECTED_RECENT_COUNT);
    const boundarySentAt = toTimestamp(protectedDocs[PROTECTED_RECENT_COUNT - 1]?.data().sentAt);

    if (!boundarySentAt) {
      skippedReason = "missing_protected_boundary";
      status = "skipped";
      await writeCronRun({
        deletedCount,
        failedCount,
        protectedCount: protectedDocs.length,
        runId,
        skippedReason,
        startedAt,
        status,
      });
      return {
        deletedCount,
        failedCount,
        protectedCount: protectedDocs.length,
        runId,
        skippedReason,
        status,
      };
    }

    const protectedIds = new Set(protectedDocs.map((doc) => doc.id));
    const expiredSnapshot = await db
      .collection("messages")
      .where("lineAccountId", "==", lineAccountId)
      .where("expiresAt", "<=", Timestamp.now())
      .orderBy("expiresAt", "asc")
      .limit(MAX_DAILY_DELETE_COUNT + PROTECTED_RECENT_COUNT)
      .get();
    const candidates = expiredSnapshot.docs
      .filter((doc) => !protectedIds.has(doc.id))
      .filter((doc) => {
        const sentAt = toTimestamp(doc.data().sentAt);

        return Boolean(sentAt && sentAt.toMillis() < boundarySentAt.toMillis());
      })
      .slice(0, MAX_DAILY_DELETE_COUNT);

    const batches: WriteBatch[] = [];

    for (let index = 0; index < candidates.length; index += 450) {
      const batch = db.batch();

      candidates.slice(index, index + 450).forEach((doc) => batch.delete(doc.ref));
      batches.push(batch);
    }

    for (const batch of batches) {
      try {
        await batch.commit();
      } catch {
        failedCount += 1;
      }
    }

    deletedCount = failedCount ? 0 : candidates.length;
    status = failedCount ? "failed" : "success";

    await writeCronRun({
      deletedCount,
      failedCount,
      protectedCount: protectedDocs.length,
      runId,
      skippedReason,
      startedAt,
      status,
    });

    return {
      deletedCount,
      failedCount,
      protectedCount: protectedDocs.length,
      runId,
      skippedReason,
      status,
    };
  } catch (error) {
    status = "failed";
    failedCount = 1;
    await writeCronRun({
      deletedCount,
      failedCount,
      protectedCount: 0,
      runId,
      skippedReason: error instanceof Error ? error.message : "unknown_error",
      startedAt,
      status,
    });
    throw error;
  }
}

export async function listCronRuns(limit = 20): Promise<CronRunView[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection("cronRuns")
    .orderBy("startedAt", "desc")
    .limit(normalizeLimit(limit, 50))
    .get();

  return snapshot.docs.map((doc) => toCronRunView(doc.id, doc.data()));
}

function normalizeLimit(value: number, max = 200) {
  if (!Number.isInteger(value) || value < 1) {
    return 100;
  }

  return Math.min(value, max);
}

async function getRecentMessagesSnapshot(lineAccountId: string, limit: number) {
  const db = getAdminDb();

  try {
    return await db
      .collection("messages")
      .where("lineAccountId", "==", lineAccountId)
      .orderBy("sentAt", "desc")
      .limit(limit)
      .get();
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }

    return db.collection("messages").where("lineAccountId", "==", lineAccountId).limit(limit).get();
  }
}

function isMissingIndexError(error: unknown) {
  return error instanceof Error && error.message.includes("FAILED_PRECONDITION");
}

function toMessageRecord(messageId: string, data: FirebaseFirestore.DocumentData): MessageRecord {
  return {
    createdAt: toIsoString(data.createdAt),
    expiresAt: toIsoString(data.expiresAt) ?? new Date(0).toISOString(),
    lineAccountId: String(data.lineAccountId ?? ""),
    lineMessageId: String(data.lineMessageId ?? ""),
    messageId,
    messageType: "text",
    receivedAt: toIsoString(data.receivedAt) ?? new Date(0).toISOString(),
    senderDisplayName: String(data.senderDisplayName ?? "不明なユーザー"),
    sentAt: toIsoString(data.sentAt) ?? new Date(0).toISOString(),
    sourceGroupId: typeof data.sourceGroupId === "string" ? data.sourceGroupId : null,
    sourceGroupName: typeof data.sourceGroupName === "string" ? data.sourceGroupName : null,
    sourceType: data.sourceType === "group" ? "group" : "user",
    sourceUserId: typeof data.sourceUserId === "string" ? data.sourceUserId : null,
    text: String(data.text ?? ""),
    webhookEventId: String(data.webhookEventId ?? ""),
  };
}

function toMessageView(record: MessageRecord): MessageView {
  return {
    expiresAt: record.expiresAt,
    lineAccountId: record.lineAccountId,
    messageId: record.messageId,
    messageType: record.messageType,
    senderDisplayName: record.senderDisplayName,
    sentAt: record.sentAt,
    sourceGroupId: record.sourceGroupId,
    sourceGroupName: record.sourceGroupName,
    sourceType: record.sourceType,
    text: record.text,
  };
}

async function writeCronRun(input: {
  deletedCount: number;
  failedCount: number;
  protectedCount: number;
  runId: string;
  skippedReason: null | string;
  startedAt: Date;
  status: CronRunView["status"];
}) {
  const db = getAdminDb();

  await db.collection("cronRuns").doc(input.runId).set({
    deletedCount: input.deletedCount,
    failedCount: input.failedCount,
    finishedAt: FieldValue.serverTimestamp(),
    protectedCount: input.protectedCount,
    runId: input.runId,
    skippedReason: input.skippedReason,
    startedAt: Timestamp.fromDate(input.startedAt),
    status: input.status,
    type: "delete_expired_messages",
  });
}

function toCronRunView(runId: string, data: FirebaseFirestore.DocumentData): CronRunView {
  return {
    deletedCount: Number(data.deletedCount ?? 0),
    failedCount: Number(data.failedCount ?? 0),
    finishedAt: toIsoString(data.finishedAt),
    protectedCount: Number(data.protectedCount ?? 0),
    runId,
    skippedReason: typeof data.skippedReason === "string" ? data.skippedReason : null,
    startedAt: toIsoString(data.startedAt) ?? new Date(0).toISOString(),
    status:
      data.status === "failed" || data.status === "skipped" || data.status === "success"
        ? data.status
        : "failed",
  };
}
