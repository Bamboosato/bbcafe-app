import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import {
  backfillBroadcastUsersFromMessages,
  listBroadcastUsers,
} from "@/features/messages/server/broadcasts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    let users = await listBroadcastUsers(auth.payload.lineAccountId);

    if (!users.length) {
      await backfillBroadcastUsersFromMessages(auth.payload.lineAccountId);
      users = await listBroadcastUsers(auth.payload.lineAccountId);
    }

    return jsonData({ users }, requestId);
  } catch (error) {
    console.error("[users-list] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "ユーザ情報を取得できません。", requestId);
  }
}
