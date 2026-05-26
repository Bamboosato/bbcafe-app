import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { DEFAULT_LINE_ACCOUNT_ID } from "@/features/messages/server/lineAccounts";
import { listVisibleMessages } from "@/features/messages/server/messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const messages = await listVisibleMessages(DEFAULT_LINE_ACCOUNT_ID, limit);

    return jsonData({ messages }, requestId);
  } catch (error) {
    console.error("[admin-messages-list] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを取得できません。", requestId);
  }
}
