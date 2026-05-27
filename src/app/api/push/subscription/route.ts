import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import { getLineAccount } from "@/features/messages/server/lineAccounts";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "@/features/messages/server/pushNotifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await readJsonBody(request);
    const viewerSharedId = await resolveViewerSharedId(auth.payload.lineAccountId, auth.payload.viewerSharedId);
    const subscription =
      typeof body === "object" && body !== null && "subscription" in body
        ? (body as { subscription?: unknown }).subscription
        : body;
    const result = await upsertPushSubscription({
      lineAccountId: auth.payload.lineAccountId,
      subscription,
      userAgent: request.headers.get("user-agent"),
      viewerSharedId,
    });

    return jsonData({ subscribed: true, subscriptionId: result.subscriptionId }, requestId, 201);
  } catch (error) {
    return handlePushSubscriptionError(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await readJsonBody(request);
    const viewerSharedId = await resolveViewerSharedId(auth.payload.lineAccountId, auth.payload.viewerSharedId);
    const endpoint =
      typeof body === "object" && body !== null && "endpoint" in body
        ? (body as { endpoint?: unknown }).endpoint
        : null;

    await deletePushSubscription({
      endpoint,
      lineAccountId: auth.payload.lineAccountId,
      viewerSharedId,
    });

    return jsonData({ subscribed: false }, requestId);
  } catch (error) {
    return handlePushSubscriptionError(error, requestId);
  }
}

async function resolveViewerSharedId(lineAccountId: string, sessionViewerSharedId?: string) {
  if (sessionViewerSharedId?.trim()) {
    return sessionViewerSharedId.trim();
  }

  const account = await getLineAccount(lineAccountId);

  return account.viewerSharedId;
}

function handlePushSubscriptionError(error: unknown, requestId: string) {
  if (error instanceof Error && error.message === "INVALID_JSON") {
    return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
  }

  if (error instanceof Error && error.message === "INVALID_PUSH_SUBSCRIPTION") {
    return jsonError(400, "VALIDATION_ERROR", "通知購読情報が正しくありません。", requestId);
  }

  console.error("[push-subscription] failed", {
    message: error instanceof Error ? error.message : String(error),
    requestId,
  });

  return jsonError(503, "SERVICE_UNAVAILABLE", "通知設定を更新できません。", requestId);
}
