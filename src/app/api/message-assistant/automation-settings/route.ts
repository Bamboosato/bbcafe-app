import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  getDailyBroadcastSettings,
  updateDailyBroadcastSettings,
} from "@/features/messages/server/broadcasts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const settings = await getDailyBroadcastSettings(auth.payload.lineAccountId);

    return jsonData({ settings }, requestId);
  } catch (error) {
    console.error("[automation-settings-get] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "自動送信設定を取得できません。", requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await readJsonBody(request);
    const enabled =
      typeof body === "object" && body !== null && typeof (body as { enabled?: unknown }).enabled === "boolean"
        ? (body as { enabled: boolean }).enabled
        : null;

    if (enabled === null) {
      return jsonError(400, "VALIDATION_ERROR", "自動送信の設定値が正しくありません。", requestId);
    }

    const settings = await updateDailyBroadcastSettings({
      enabled,
      lineAccountId: auth.payload.lineAccountId,
    });

    return jsonData({ settings }, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[automation-settings-update] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "自動送信設定を更新できません。", requestId);
  }
}
