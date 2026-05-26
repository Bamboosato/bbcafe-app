import crypto from "node:crypto";
import { safeStringEqual, stableHash } from "@/lib/server/crypto";
import { getLineAccount } from "./lineAccounts";
import { saveTextMessage, deleteMessagesByLineMessageId } from "./messages";

const FALLBACK_GROUP_NAME = "ユーザグループ";
const FALLBACK_USER_NAME = "不明なユーザー";

type LineWebhookPayload = {
  events?: LineWebhookEvent[];
};

type LineWebhookEvent = {
  mode?: string;
  source?: {
    groupId?: string;
    roomId?: string;
    type?: "group" | "room" | "user";
    userId?: string;
  };
  timestamp?: number;
  type?: string;
  webhookEventId?: string;
  message?: {
    id?: string;
    text?: string;
    type?: string;
  };
  unsend?: {
    messageId?: string;
  };
};

export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string) {
  if (!signature) {
    return false;
  }

  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");

  return safeStringEqual(expected, signature);
}

export async function processLineWebhookEvents(input: {
  channelAccessToken: string;
  lineAccountId: string;
  payload: LineWebhookPayload;
}) {
  const events = Array.isArray(input.payload.events) ? input.payload.events : [];
  const results = {
    deleted: 0,
    ignored: 0,
    saved: 0,
  };

  for (const event of events) {
    if (event.type === "message" && event.message?.type === "text") {
      const saved = await processTextMessageEvent(input.lineAccountId, input.channelAccessToken, event);

      if (saved) {
        results.saved += 1;
      } else {
        results.ignored += 1;
      }
      continue;
    }

    if (event.type === "unsend" && event.unsend?.messageId) {
      results.deleted += await deleteMessagesByLineMessageId(input.lineAccountId, event.unsend.messageId);
      continue;
    }

    results.ignored += 1;
  }

  return results;
}

async function processTextMessageEvent(
  lineAccountId: string,
  channelAccessToken: string,
  event: LineWebhookEvent,
) {
  const text = event.message?.text;
  const lineMessageId = event.message?.id;

  if (!text || !lineMessageId) {
    return false;
  }

  const sourceUserId = event.source?.userId ?? null;
  const groupId = event.source?.groupId ?? event.source?.roomId ?? null;
  const sourceType = event.source?.type === "user" ? "user" : "group";
  const [senderDisplayName, sourceGroupName] = await Promise.all([
    resolveSenderDisplayName(channelAccessToken, sourceType, sourceUserId, groupId),
    sourceType === "group" && groupId ? resolveGroupName(channelAccessToken, groupId) : Promise.resolve(null),
  ]);
  const sentAt = typeof event.timestamp === "number" ? new Date(event.timestamp) : new Date();
  const account = await getLineAccount(lineAccountId);
  const expiresAt = new Date(sentAt.getTime() + account.retentionDays * 24 * 60 * 60 * 1000);
  const webhookEventId = event.webhookEventId || stableHash(`${lineMessageId}:${sentAt.toISOString()}`);
  const result = await saveTextMessage({
    expiresAt,
    lineAccountId,
    lineMessageId,
    receivedAt: new Date(),
    senderDisplayName,
    sentAt,
    sourceGroupId: sourceType === "group" ? groupId : null,
    sourceGroupName: sourceType === "group" ? sourceGroupName ?? FALLBACK_GROUP_NAME : null,
    sourceType,
    sourceUserId,
    text,
    webhookEventId,
  });

  return result.created;
}

async function resolveSenderDisplayName(
  channelAccessToken: string,
  sourceType: "group" | "user",
  sourceUserId: null | string,
  groupId: null | string,
) {
  if (!sourceUserId) {
    return FALLBACK_USER_NAME;
  }

  const path =
    sourceType === "group" && groupId
      ? `/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(sourceUserId)}`
      : `/v2/bot/profile/${encodeURIComponent(sourceUserId)}`;
  const data = await fetchLineJson<{ displayName?: string }>(channelAccessToken, path);

  return data?.displayName?.trim() || FALLBACK_USER_NAME;
}

async function resolveGroupName(channelAccessToken: string, groupId: string) {
  const data = await fetchLineJson<{ groupName?: string }>(
    channelAccessToken,
    `/v2/bot/group/${encodeURIComponent(groupId)}/summary`,
  );

  return data?.groupName?.trim() || FALLBACK_GROUP_NAME;
}

async function fetchLineJson<T>(channelAccessToken: string, path: string): Promise<T | null> {
  try {
    const response = await fetch(`https://api.line.me${path}`, {
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
