import { jsonData, jsonError } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import { getWebPushPublicKey } from "@/features/messages/server/pushNotifications";

export const runtime = "nodejs";

export async function GET() {
  const requestId = createRequestId();
  const publicKey = getWebPushPublicKey();

  if (!publicKey) {
    return jsonError(503, "SERVICE_UNAVAILABLE", "通知設定が不足しています。", requestId);
  }

  return jsonData({ publicKey }, requestId);
}
