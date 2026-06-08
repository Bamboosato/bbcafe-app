import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createPasswordHash, normalizeLoginId } from "@/lib/server/crypto";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  getDailyBroadcastSettings,
  updateDailyBroadcastSettings,
} from "@/features/messages/server/broadcasts";
import {
  DEFAULT_LINE_ACCOUNT_ID,
  getLineAccount,
  updateLineAccountSettings,
} from "@/features/messages/server/lineAccounts";
import { getConfiguredAdminLoginId } from "@/features/messages/server/login";
import type { CommonSettingsView } from "@/features/messages/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireAdminSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const [account, automationSettings] = await Promise.all([
      getLineAccount(DEFAULT_LINE_ACCOUNT_ID),
      getDailyBroadcastSettings(DEFAULT_LINE_ACCOUNT_ID),
    ]);

    return jsonData({ settings: toCommonSettingsView(account, automationSettings.historyRetentionDays) }, requestId);
  } catch (error) {
    console.error("[common-settings-get] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "共通設定を取得できません。", requestId);
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
    const displayName = pickString(body, "displayName")?.trim();
    const viewerSharedId = pickString(body, "viewerSharedId")?.trim();
    const viewerPassword = pickString(body, "viewerPassword");
    const receivedRetentionDays = pickPositiveInteger(body, "receivedRetentionDays");
    const sentRetentionDays = pickPositiveInteger(body, "sentRetentionDays");

    if (!displayName || !viewerSharedId || !receivedRetentionDays || !sentRetentionDays) {
      return jsonError(400, "VALIDATION_ERROR", "共通設定の値が正しくありません。", requestId);
    }

    if (normalizeLoginId(viewerSharedId) === normalizeLoginId(getConfiguredAdminLoginId())) {
      return jsonError(409, "CONFLICT", "共有IDに管理者IDと同じ値は設定できません。", requestId);
    }

    const [account, automationSettings] = await Promise.all([
      updateLineAccountSettings({
        displayName,
        lineAccountId: DEFAULT_LINE_ACCOUNT_ID,
        retentionDays: receivedRetentionDays,
        viewerPasswordHash: viewerPassword?.trim() ? createPasswordHash(viewerPassword) : undefined,
        viewerSharedId,
      }),
      updateDailyBroadcastSettings({
        historyRetentionDays: sentRetentionDays,
        lineAccountId: DEFAULT_LINE_ACCOUNT_ID,
      }),
    ]);

    return jsonData({ settings: toCommonSettingsView(account, automationSettings.historyRetentionDays) }, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[common-settings-patch] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "共通設定を更新できません。", requestId);
  }
}

function toCommonSettingsView(
  account: {
    displayName: string;
    lineAccountId: string;
    retentionDays: number;
    viewerSharedId: string;
  },
  sentRetentionDays: number,
): CommonSettingsView {
  return {
    displayName: account.displayName,
    lineAccountId: account.lineAccountId,
    receivedRetentionDays: account.retentionDays,
    sentRetentionDays,
    viewerSharedId: account.viewerSharedId,
  };
}

function pickString(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const raw = (value as Record<string, unknown>)[key];

  return typeof raw === "string" ? raw : undefined;
}

function pickPositiveInteger(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const raw = (value as Record<string, unknown>)[key];
  const number = Number(raw);

  return Number.isInteger(number) && number >= 1 ? number : undefined;
}
