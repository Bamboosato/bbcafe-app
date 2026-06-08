import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import { updateBroadcastUserSelection } from "@/features/messages/server/broadcasts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await readJsonBody(request);
    const selected =
      typeof body === "object" && body !== null && typeof (body as { selected?: unknown }).selected === "boolean"
        ? (body as { selected: boolean }).selected
        : null;

    if (selected === null) {
      return jsonError(400, "VALIDATION_ERROR", "選択状態が正しくありません。", requestId);
    }

    const { userId } = await context.params;
    const user = await updateBroadcastUserSelection({
      lineAccountId: auth.payload.lineAccountId,
      selected,
      userId,
    });

    if (!user) {
      return jsonError(404, "NOT_FOUND", "ユーザ情報が見つかりません。", requestId);
    }

    return jsonData({ user }, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[users-update] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "ユーザ情報を更新できません。", requestId);
  }
}
