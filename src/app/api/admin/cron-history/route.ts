import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { listAutoSendRuns } from "@/features/messages/server/broadcasts";
import { listConfirmationReminderRuns } from "@/features/messages/server/confirmations";
import { buildCronHistoryItems } from "@/features/messages/server/cronHistory";
import { DEFAULT_LINE_ACCOUNT_ID } from "@/features/messages/server/lineAccounts";
import { listCronRuns } from "@/features/messages/server/messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const [deleteRunsResult, sendRunsResult, reminderRunsResult] = await Promise.allSettled([
      listCronRuns(limit),
      listAutoSendRuns(DEFAULT_LINE_ACCOUNT_ID, limit),
      listConfirmationReminderRuns(DEFAULT_LINE_ACCOUNT_ID, limit),
    ]);
    const deleteRuns = deleteRunsResult.status === "fulfilled" ? deleteRunsResult.value : [];
    const sendRuns = sendRunsResult.status === "fulfilled" ? sendRunsResult.value : [];
    const reminderRuns = reminderRunsResult.status === "fulfilled" ? reminderRunsResult.value : [];
    const warnings = [
      deleteRunsResult.status === "rejected" ? "delete_expired_messages" : null,
      sendRunsResult.status === "rejected" ? "send_daily_message" : null,
      reminderRunsResult.status === "rejected" ? "check_unconfirmed_messages" : null,
    ].filter((value): value is string => Boolean(value));

    if (deleteRunsResult.status === "rejected") {
      console.error(
        `[admin-cron-history] delete runs failed requestId=${requestId} error=${formatErrorForLog(deleteRunsResult.reason)}`,
      );
    }

    if (sendRunsResult.status === "rejected") {
      console.error(
        `[admin-cron-history] send runs failed requestId=${requestId} error=${formatErrorForLog(sendRunsResult.reason)}`,
      );
    }

    if (reminderRunsResult.status === "rejected") {
      console.error(
        `[admin-cron-history] reminder runs failed requestId=${requestId} error=${formatErrorForLog(reminderRunsResult.reason)}`,
      );
    }

    if (
      deleteRunsResult.status === "rejected" &&
      sendRunsResult.status === "rejected" &&
      reminderRunsResult.status === "rejected"
    ) {
      return jsonError(503, "SERVICE_UNAVAILABLE", "Cron履歴を取得できません。", requestId);
    }

    return jsonData({ items: buildCronHistoryItems({ deleteRuns, limit, reminderRuns, sendRuns }), warnings }, requestId);
  } catch (error) {
    console.error("[admin-cron-history] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "Cron履歴を取得できません。", requestId);
  }
}

function formatErrorForLog(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
