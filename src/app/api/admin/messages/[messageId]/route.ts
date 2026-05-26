import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { DEFAULT_LINE_ACCOUNT_ID } from "@/features/messages/server/lineAccounts";
import { deleteMessage } from "@/features/messages/server/messages";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    messageId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { messageId } = await context.params;
    const deleted = await deleteMessage(DEFAULT_LINE_ACCOUNT_ID, messageId);

    if (!deleted) {
      return jsonError(404, "NOT_FOUND", "メッセージが見つかりません。", requestId);
    }

    return jsonData({ deleted: true }, requestId);
  } catch (error) {
    console.error("[admin-message-delete] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを削除できません。", requestId);
  }
}
