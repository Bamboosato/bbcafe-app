import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { getSendRun } from "@/features/messages/server/broadcasts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { runId } = await context.params;
    const run = await getSendRun(auth.payload.lineAccountId, runId);

    if (!run) {
      return jsonError(404, "NOT_FOUND", "送信履歴が見つかりません。", requestId);
    }

    return jsonData({ run }, requestId);
  } catch (error) {
    console.error("[sent-message-detail] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "送信履歴を取得できません。", requestId);
  }
}
