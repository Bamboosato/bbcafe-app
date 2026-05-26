import { FieldValue } from "firebase-admin/firestore";
import { randomHex } from "@/lib/server/crypto";
import { getAdminDb } from "@/lib/server/firebase";

type AuditLogInput = {
  actor: "admin" | "cron" | "line" | "viewer";
  lineAccountId?: string;
  message: string;
  requestId: string;
  result: "failure" | "success";
  type: string;
};

export async function writeAuditLogBestEffort(input: AuditLogInput) {
  try {
    const db = getAdminDb();
    const logId = `log_${randomHex(12)}`;

    await db.collection("auditLogs").doc(logId).set({
      actor: input.actor,
      createdAt: FieldValue.serverTimestamp(),
      lineAccountId: input.lineAccountId ?? null,
      logId,
      message: input.message,
      requestId: input.requestId,
      result: input.result,
      type: input.type,
    });
  } catch {
    // Audit logging is best-effort. It must not mask the user-facing result.
  }
}
