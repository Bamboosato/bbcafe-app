import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { getVisibleMessage } from "@/features/messages/server/messages";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    messageId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { messageId } = await context.params;
    const message = await getVisibleMessage(auth.payload.lineAccountId, messageId);

    if (!message) {
      return jsonError(404, "NOT_FOUND", "メッセージが見つかりません。", requestId);
    }

    return jsonData({ message }, requestId);
  } catch (error) {
    console.error("[message-detail] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを取得できません。", requestId);
  }
}
