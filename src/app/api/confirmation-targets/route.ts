import {
  listUnconfirmedConfirmationTargets,
  markUnconfirmedConfirmationTargetsConfirmed,
} from "@/features/messages/server/confirmations";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const targets = (await listUnconfirmedConfirmationTargets(auth.payload.lineAccountId)).map((target) => ({
      confirmationStatus: target.status,
      reminderSentAt: target.reminderSentAt,
      runId: target.runId,
      sentAt: target.sentAt,
      userId: target.userId,
      userName: target.userName,
    }));

    return jsonData({ targets }, requestId);
  } catch (error) {
    console.error("[confirmation-targets-list] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "未確認メッセージ情報を取得できません。", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const resetCount = await markUnconfirmedConfirmationTargetsConfirmed(auth.payload.lineAccountId);

    return jsonData({ resetCount }, requestId);
  } catch (error) {
    console.error("[confirmation-targets-reset] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "未確認状態をリセットできません。", requestId);
  }
}
