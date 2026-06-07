import { getLineCredentials } from "@/features/messages/server/credentials";
import { formatDailyGreetingForSend } from "@/features/messages/server/gemini";
import { listUserInfos } from "@/features/messages/server/messages";
import { sendLineTextMessages } from "@/features/messages/server/outboundLine";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";

export const runtime = "nodejs";

type SendRequestBody = {
  message?: unknown;
  userIds?: unknown;
};

export async function POST(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  let body: SendRequestBody;

  try {
    body = (await request.json()) as SendRequestBody;
  } catch {
    return jsonError(400, "INVALID_JSON", "リクエストの形式が正しくありません。", requestId);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const requestedUserIds = Array.isArray(body.userIds)
    ? body.userIds.filter((userId): userId is string => typeof userId === "string" && Boolean(userId.trim()))
    : [];
  const uniqueUserIds = [...new Set(requestedUserIds.map((userId) => userId.trim()))];

  if (!message) {
    return jsonError(400, "VALIDATION_ERROR", "送信するメッセージを入力してください。", requestId);
  }

  if (uniqueUserIds.length === 0) {
    return jsonError(400, "VALIDATION_ERROR", "送信先ユーザを選択してください。", requestId);
  }

  try {
    const users = await listUserInfos(auth.payload.lineAccountId);
    const availableUserIds = new Set(users.map((user) => user.userId));
    const validUserIds = uniqueUserIds.filter((userId) => availableUserIds.has(userId));

    if (validUserIds.length === 0) {
      return jsonError(400, "VALIDATION_ERROR", "送信できるユーザが選択されていません。", requestId);
    }

    const credentials = await getLineCredentials(auth.payload.lineAccountId);
    const text = formatDailyGreetingForSend(message);
    const results = await sendLineTextMessages({
      channelAccessToken: credentials.channelAccessToken,
      text,
      userIds: validUserIds,
    });
    const failed = results.filter((result) => !result.ok);

    if (failed.length > 0) {
      console.error("[message-assistant-send] partial failure", {
        failed,
        requestId,
      });
    }

    return jsonData(
      {
        failedCount: failed.length,
        sentCount: results.length - failed.length,
        totalCount: results.length,
      },
      requestId,
      failed.length > 0 ? 207 : 200,
    );
  } catch (error) {
    console.error("[message-assistant-send] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを送信できません。", requestId);
  }
}
