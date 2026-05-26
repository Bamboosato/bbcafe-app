import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createPasswordHash } from "@/lib/server/crypto";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  DEFAULT_LINE_ACCOUNT_ID,
  getLineAccount,
  toLineAccountView,
  updateLineAccountSettings,
} from "@/features/messages/server/lineAccounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const account = await getLineAccount(DEFAULT_LINE_ACCOUNT_ID);

    return jsonData({ settings: toLineAccountView(account) }, requestId);
  } catch (error) {
    console.error("[admin-settings-get] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "設定を取得できません。", requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await readJsonBody(request);
    const displayName = pickString(body, "displayName");
    const viewerSharedId = pickString(body, "viewerSharedId");
    const viewerPassword = pickString(body, "viewerPassword");
    const retentionDays = pickNumber(body, "retentionDays");
    const account = await updateLineAccountSettings({
      displayName,
      lineAccountId: DEFAULT_LINE_ACCOUNT_ID,
      retentionDays,
      viewerPasswordHash: viewerPassword ? createPasswordHash(viewerPassword) : undefined,
      viewerSharedId,
    });

    return jsonData({ settings: toLineAccountView(account) }, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[admin-settings-patch] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "設定を更新できません。", requestId);
  }
}

function pickString(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const raw = (value as Record<string, unknown>)[key];

  return typeof raw === "string" ? raw : undefined;
}

function pickNumber(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const raw = (value as Record<string, unknown>)[key];
  const number = Number(raw);

  return Number.isInteger(number) ? number : undefined;
}
