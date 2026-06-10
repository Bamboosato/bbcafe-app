import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireAdminSession } from "@/lib/server/auth";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  getDailyBroadcastSettings,
  updateDailyBroadcastSettings,
} from "@/features/messages/server/broadcasts";
import {
  saveEncryptedLineCredentials,
  validateLineCredentialInput,
} from "@/features/messages/server/credentials";
import {
  getLineAccount,
  updateLineAccountSettings,
} from "@/features/messages/server/lineAccounts";
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
      getLineAccount(auth.payload.lineAccountId),
      getDailyBroadcastSettings(auth.payload.lineAccountId),
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
    const channelAccessToken = pickString(body, "channelAccessToken")?.trim();
    const channelId = pickString(body, "channelId")?.trim();
    const channelSecret = pickString(body, "channelSecret")?.trim();
    const displayName = pickString(body, "displayName")?.trim();
    const receivedRetentionDays = pickPositiveInteger(body, "receivedRetentionDays");
    const sentRetentionDays = pickPositiveInteger(body, "sentRetentionDays");
    const credentialsProvided = Boolean(channelSecret || channelAccessToken);

    if (!displayName || !channelId || !receivedRetentionDays || !sentRetentionDays) {
      return jsonError(400, "VALIDATION_ERROR", "共通設定の値が正しくありません。", requestId);
    }

    if (credentialsProvided && (!channelSecret || !channelAccessToken)) {
      return jsonError(400, "VALIDATION_ERROR", "Channel SecretとChannel Access Tokenを両方入力してください。", requestId);
    }

    let accessTokenValidatedAt: Date | undefined;
    const nextChannelId = channelId ?? "";

    if (credentialsProvided) {
      const nextChannelAccessToken = channelAccessToken ?? "";
      const nextChannelSecret = channelSecret ?? "";

      await validateLineCredentialInput({
        channelAccessToken: nextChannelAccessToken,
        channelId: nextChannelId,
        channelSecret: nextChannelSecret,
      });
      await saveEncryptedLineCredentials({
        channelAccessToken: nextChannelAccessToken,
        channelSecret: nextChannelSecret,
        lineAccountId: auth.payload.lineAccountId,
      });
      accessTokenValidatedAt = new Date();
    }

    const [account, automationSettings] = await Promise.all([
      updateLineAccountSettings({
        accessTokenValidatedAt,
        channelId: nextChannelId,
        credentialProvider: credentialsProvided ? "encryptedFirestore" : undefined,
        displayName,
        lineAccountId: auth.payload.lineAccountId,
        retentionDays: receivedRetentionDays,
      }),
      updateDailyBroadcastSettings({
        historyRetentionDays: sentRetentionDays,
        lineAccountId: auth.payload.lineAccountId,
      }),
    ]);

    return jsonData({ settings: toCommonSettingsView(account, automationSettings.historyRetentionDays) }, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    if (error instanceof Error && error.message === "INVALID_LINE_CREDENTIALS") {
      return jsonError(400, "VALIDATION_ERROR", "LINEチャンネル資格情報を入力してください。", requestId);
    }

    if (error instanceof Error && error.message === "INVALID_LINE_ACCESS_TOKEN") {
      return jsonError(400, "VALIDATION_ERROR", "Channel Access Tokenを検証できません。", requestId);
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
    accessTokenValidatedAt: null | string;
    channelId: string;
    displayName: string;
    lineAccountId: string;
    retentionDays: number;
    webhookVerifiedAt: null | string;
  },
  sentRetentionDays: number,
): CommonSettingsView {
  return {
    accessTokenValidatedAt: account.accessTokenValidatedAt,
    channelId: account.channelId,
    displayName: account.displayName,
    lineAccountId: account.lineAccountId,
    receivedRetentionDays: account.retentionDays,
    sentRetentionDays,
    webhookUrlPath: `/api/line/webhook/${account.lineAccountId}`,
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
