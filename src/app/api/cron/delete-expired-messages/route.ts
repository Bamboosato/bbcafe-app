import { jsonData, jsonError } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import { listActiveLineAccounts } from "@/features/messages/server/lineAccounts";
import { runExpiredMessageDeletion } from "@/features/messages/server/messages";
import { deleteExpiredSendRuns } from "@/features/messages/server/broadcasts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!expected) {
    return jsonError(503, "SERVICE_UNAVAILABLE", "Cron認証の設定が不足しています。", requestId);
  }

  if (token !== expected) {
    return jsonError(401, "UNAUTHORIZED", "Cron認証に失敗しました。", requestId);
  }

  try {
    const accounts = await listActiveLineAccounts();
    const results = [];

    for (const account of accounts) {
      try {
        const [messagesResult, sendRunsResult] = await Promise.all([
          runExpiredMessageDeletion(account.lineAccountId),
          deleteExpiredSendRuns(account.lineAccountId),
        ]);

        results.push({
          ...messagesResult,
          lineAccountId: account.lineAccountId,
          sendRunsDeletedCount: sendRunsResult.deletedCount,
          sendRunsFailedCount: sendRunsResult.failedCount,
        });
      } catch (error) {
        console.error("[cron-delete-expired-messages] account failed", {
          lineAccountId: account.lineAccountId,
          message: error instanceof Error ? error.message : String(error),
          requestId,
        });
        results.push({
          error: error instanceof Error ? error.message : String(error),
          lineAccountId: account.lineAccountId,
          status: "failed",
        });
      }
    }

    return jsonData({ results }, requestId, results.some((result) => result.status === "failed") ? 207 : 200);
  } catch (error) {
    console.error("[cron-delete-expired-messages] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "期限切れメッセージを削除できません。", requestId);
  }
}
