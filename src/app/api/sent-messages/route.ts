import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { listSendRunsPage } from "@/features/messages/server/broadcasts";
import {
  DEFAULT_HISTORY_PAGE_LIMIT,
  InvalidHistoryCursorError,
} from "@/features/messages/server/historyPagination";

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
    const page = await listSendRunsPage(auth.payload.lineAccountId, { cursor, limit });

    return jsonData(page, requestId);
  } catch (error) {
    if (error instanceof InvalidHistoryCursorError) {
      return jsonError(400, "VALIDATION_ERROR", "履歴の続き取得情報が不正です。", requestId);
    }

    console.error("[sent-messages-list] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "送信履歴を取得できません。", requestId);
  }
}
