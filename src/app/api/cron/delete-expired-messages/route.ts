import { jsonData, jsonError } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import { DEFAULT_LINE_ACCOUNT_ID } from "@/features/messages/server/lineAccounts";
import { runExpiredMessageDeletion } from "@/features/messages/server/messages";

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
    const result = await runExpiredMessageDeletion(DEFAULT_LINE_ACCOUNT_ID);

    return jsonData(result, requestId);
  } catch (error) {
    console.error("[cron-delete-expired-messages] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "期限切れメッセージを削除できません。", requestId);
  }
}
