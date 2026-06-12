import crypto from "node:crypto";
import { safeStringEqual, stableHash } from "@/lib/server/crypto";
import { getLineAccount } from "./lineAccounts";
import { saveTextMessage, deleteMessagesByLineMessageId } from "./messages";
import { sendNewMessagePushNotifications } from "./pushNotifications";
import { upsertBroadcastUser } from "./broadcasts";
import { markConfirmationFromPostback } from "./confirmations";

const FALLBACK_GROUP_NAME = "ユーザグループ";
const FALLBACK_USER_NAME = "不明なユーザー";
const LINE_FOLLOWERS_PAGE_LIMIT = 1000;

type LineWebhookPayload = {
  events?: LineWebhookEvent[];
};

type SourceProfileContext = {
  groupId: null | string;
  sourceType: "group" | "room" | "user";
  sourceUserId: null | string;
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
  postback?: {
    data?: string;
  };
  unsend?: {
    messageId?: string;
  };
};

export type ImportLineFollowersResult = {
  failedProfileCount: number;
  importedCount: number;
  pageCount: number;
  totalFollowerCount: number;
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
    confirmed: 0,
    deleted: 0,
    followed: 0,
    ignored: 0,
    saved: 0,
  };

  for (const event of events) {
    if (event.type === "postback" && event.postback?.data) {
      const result = await markConfirmationFromPostback({
        lineAccountId: input.lineAccountId,
        postbackData: event.postback.data,
        sourceUserId: event.source?.userId ?? null,
      });

      if (result.confirmed) {
        results.confirmed += 1;
      } else {
        results.ignored += 1;
      }
      continue;
    }

    if (event.type === "message" && event.message?.type === "text") {
      const saved = await processTextMessageEvent(input.lineAccountId, input.channelAccessToken, event);

      if (saved) {
        results.saved += 1;
      } else {
        results.ignored += 1;
      }
      continue;
    }

    if (event.type === "follow") {
      const followed = await processFollowEvent(input.lineAccountId, input.channelAccessToken, event);

      if (followed) {
        results.followed += 1;
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

export async function importLineFollowers(input: {
  channelAccessToken: string;
  lineAccountId: string;
}): Promise<ImportLineFollowersResult> {
  let failedProfileCount = 0;
  let importedCount = 0;
  let pageCount = 0;
  let start: null | string = null;
  let totalFollowerCount = 0;
  const importedAt = new Date();

  do {
    const page = await fetchFollowerIds(input.channelAccessToken, start);
    pageCount += 1;
    totalFollowerCount += page.userIds.length;

    for (const userId of page.userIds) {
      const userName = await resolveSenderDisplayName(input.channelAccessToken, {
        groupId: null,
        sourceType: "user",
        sourceUserId: userId,
      });

      if (userName === FALLBACK_USER_NAME) {
        failedProfileCount += 1;
      }

      await upsertBroadcastUser({
        firstSeenAt: importedAt,
        lastSeenAt: importedAt,
        lineAccountId: input.lineAccountId,
        userId,
        userName,
      });
      importedCount += 1;
    }

    start = page.next ?? null;
  } while (start);

  return {
    failedProfileCount,
    importedCount,
    pageCount,
    totalFollowerCount,
  };
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
  const lineSourceType = normalizeLineSourceType(event.source?.type);
  const groupId = lineSourceType === "group" ? event.source?.groupId ?? null : event.source?.roomId ?? null;
  const sourceType = lineSourceType === "user" ? "user" : "group";
  const [sourceUserDisplayName, sourceGroupName] = await Promise.all([
    resolveSenderDisplayName(channelAccessToken, { groupId, sourceType: lineSourceType, sourceUserId }),
    lineSourceType === "group" && groupId ? resolveGroupName(channelAccessToken, groupId) : Promise.resolve(null),
  ]);
  const sentAt = typeof event.timestamp === "number" ? new Date(event.timestamp) : new Date();
  const account = await getLineAccount(lineAccountId);
  const expiresAt = new Date(sentAt.getTime() + account.retentionDays * 24 * 60 * 60 * 1000);
  const webhookEventId = event.webhookEventId || stableHash(`${lineMessageId}:${sentAt.toISOString()}`);

  if (sourceUserId) {
    await upsertBroadcastUser({
      lastMessageAt: sentAt,
      lastSeenAt: new Date(),
      lineAccountId,
      userId: sourceUserId,
      userName: sourceUserDisplayName,
    });
  }

  const result = await saveTextMessage({
    expiresAt,
    lineAccountId,
    lineMessageId,
    receivedAt: new Date(),
    senderDisplayName: sourceUserDisplayName,
    sentAt,
    sourceGroupId: sourceType === "group" ? groupId : null,
    sourceGroupName: sourceType === "group" ? sourceGroupName ?? FALLBACK_GROUP_NAME : null,
    sourceType,
    sourceUserDisplayName,
    sourceUserId,
    text,
    webhookEventId,
  });

  if (result.created) {
    await sendNewMessagePushNotifications({
      accountDisplayName: account.displayName,
      lineAccountId,
    }).catch((error) => {
      console.warn("[line-webhook] push notification failed", {
        lineAccountId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return result.created;
}

async function processFollowEvent(
  lineAccountId: string,
  channelAccessToken: string,
  event: LineWebhookEvent,
) {
  const sourceUserId = event.source?.userId ?? null;

  if (!sourceUserId) {
    return false;
  }

  const followedAt = typeof event.timestamp === "number" ? new Date(event.timestamp) : new Date();
  const sourceUserDisplayName = await resolveSenderDisplayName(channelAccessToken, {
    groupId: null,
    sourceType: "user",
    sourceUserId,
  });

  await upsertBroadcastUser({
    firstSeenAt: followedAt,
    lastSeenAt: followedAt,
    lineAccountId,
    userId: sourceUserId,
    userName: sourceUserDisplayName,
  });

  return true;
}

function normalizeLineSourceType(sourceType: NonNullable<LineWebhookEvent["source"]>["type"]) {
  return sourceType === "group" || sourceType === "room" || sourceType === "user" ? sourceType : "user";
}

export function getSenderProfilePath({ groupId, sourceType, sourceUserId }: SourceProfileContext) {
  if (!sourceUserId) {
    return null;
  }

  if (sourceType === "group" && groupId) {
    return `/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(sourceUserId)}`;
  }

  if (sourceType === "room" && groupId) {
    return `/v2/bot/room/${encodeURIComponent(groupId)}/member/${encodeURIComponent(sourceUserId)}`;
  }

  return `/v2/bot/profile/${encodeURIComponent(sourceUserId)}`;
}

async function resolveSenderDisplayName(channelAccessToken: string, context: SourceProfileContext) {
  const path = getSenderProfilePath(context);

  if (!path) {
    return FALLBACK_USER_NAME;
  }

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

async function fetchFollowerIds(channelAccessToken: string, start: null | string) {
  const params = new URLSearchParams({
    limit: String(LINE_FOLLOWERS_PAGE_LIMIT),
  });

  if (start) {
    params.set("start", start);
  }

  const response = await fetch(`https://api.line.me/v2/bot/followers/ids?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`LINE_FOLLOWERS_IDS_${response.status}`);
  }

  const data = (await response.json()) as {
    next?: string;
    userIds?: unknown;
  };

  return {
    next: typeof data.next === "string" && data.next.trim() ? data.next : null,
    userIds: Array.isArray(data.userIds) ? data.userIds.filter((userId): userId is string => typeof userId === "string") : [],
  };
}
