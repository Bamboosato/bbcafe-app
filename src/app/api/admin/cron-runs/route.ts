import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { listCronRuns } from "@/features/messages/server/messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const runs = await listCronRuns(20);

    return jsonData({ runs }, requestId);
  } catch (error) {
    console.error("[admin-cron-runs] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "自動削除履歴を取得できません。", requestId);
  }
}
