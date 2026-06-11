import { countSelectedBroadcastUsers } from "@/features/messages/server/broadcasts";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const selectedUserCount = await countSelectedBroadcastUsers(auth.payload.lineAccountId);

    return jsonData({ selectedUserCount }, requestId);
  } catch (error) {
    console.error("[users-summary] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "ユーザ情報の概要を取得できません。", requestId);
  }
}
