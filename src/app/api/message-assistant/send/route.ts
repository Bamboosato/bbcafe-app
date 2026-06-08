import { getLineCredentials } from "@/features/messages/server/credentials";
import { formatDailyGreetingForSend } from "@/features/messages/server/gemini";
import { sendLineTextMessages } from "@/features/messages/server/outboundLine";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import {
  getDailyBroadcastSettings,
  listSelectedBroadcastUsers,
  saveSendRun,
} from "@/features/messages/server/broadcasts";
import type { SendRunTargetView, UserInfoView } from "@/features/messages/types";

export const runtime = "nodejs";

type SendRequestBody = {
  message?: unknown;
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

  if (!message) {
    return jsonError(400, "VALIDATION_ERROR", "送信するメッセージを入力してください。", requestId);
  }

  let selectedUsers: UserInfoView[] = [];

  try {
    selectedUsers = await listSelectedBroadcastUsers(auth.payload.lineAccountId);

    if (selectedUsers.length === 0) {
      return jsonError(400, "VALIDATION_ERROR", "送信先ユーザを選択してください。", requestId);
    }

    const credentials = await getLineCredentials(auth.payload.lineAccountId);
    const text = formatDailyGreetingForSend(message);
    const results = await sendLineTextMessages({
      channelAccessToken: credentials.channelAccessToken,
      text,
      userIds: selectedUsers.map((user) => user.userId),
    });
    const failed = results.filter((result) => !result.ok);
    const targets = toSendRunTargets(selectedUsers, results);
    const settings = await getDailyBroadcastSettings(auth.payload.lineAccountId);
    const sendRun = await saveSendRun({
      historyRetentionDays: settings.historyRetentionDays,
      lineAccountId: auth.payload.lineAccountId,
      messageText: text,
      mode: "manual",
      requestId,
      targets,
      trigger: "viewer",
    });

    if (failed.length > 0) {
      console.error("[message-assistant-send] partial failure", {
        failed,
        requestId,
      });
    }

    return jsonData(
      {
        failedCount: failed.length,
        run: sendRun,
        sentCount: results.length - failed.length,
        totalCount: results.length,
      },
      requestId,
      failed.length > 0 ? 207 : 200,
    );
  } catch (error) {
    if (selectedUsers.length > 0) {
      await saveManualFailureRun({
        error,
        lineAccountId: auth.payload.lineAccountId,
        message,
        requestId,
        selectedUsers,
      }).catch((saveError) => {
        console.error("[message-assistant-send] failed to save failure run", {
          message: saveError instanceof Error ? saveError.message : String(saveError),
          requestId,
        });
      });
    }

    console.error("[message-assistant-send] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを送信できません。", requestId);
  }
}

function toSendRunTargets(
  users: UserInfoView[],
  results: Awaited<ReturnType<typeof sendLineTextMessages>>,
): SendRunTargetView[] {
  const usersById = new Map(users.map((user) => [user.userId, user]));

  return results.map((result) => {
    const user = usersById.get(result.userId);

    return {
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      httpStatus: result.status,
      status: result.ok ? "success" : "failed",
      userId: result.userId,
      userName: user?.userName ?? "不明なユーザー",
    };
  });
}

async function saveManualFailureRun({
  error,
  lineAccountId,
  message,
  requestId,
  selectedUsers,
}: {
  error: unknown;
  lineAccountId: string;
  message: string;
  requestId: string;
  selectedUsers: UserInfoView[];
}) {
  const settings = await getDailyBroadcastSettings(lineAccountId);
  const text = formatDailyGreetingForSend(message);
  const errorCode = error instanceof Error ? error.message.slice(0, 80) : "SEND_FAILED";

  await saveSendRun({
    historyRetentionDays: settings.historyRetentionDays,
    lineAccountId,
    messageText: text,
    mode: "manual",
    requestId,
    targets: selectedUsers.map((user) => ({
      errorCode,
      status: "failed",
      userId: user.userId,
      userName: user.userName,
    })),
    trigger: "viewer",
  });
}
