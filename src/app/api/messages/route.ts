import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import {
  InvalidHistoryCursorError,
  DEFAULT_HISTORY_PAGE_LIMIT,
} from "@/features/messages/server/historyPagination";
import { listVisibleMessagesPage } from "@/features/messages/server/messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Number(url.searchParams.get("limit") ?? DEFAULT_HISTORY_PAGE_LIMIT);
    const page = await listVisibleMessagesPage(auth.payload.lineAccountId, { cursor, limit });

    return jsonData(page, requestId);
  } catch (error) {
    if (error instanceof InvalidHistoryCursorError) {
      return jsonError(400, "VALIDATION_ERROR", "履歴の続き取得情報が不正です。", requestId);
    }

    console.error("[messages-list] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを取得できません。", requestId);
  }
}
