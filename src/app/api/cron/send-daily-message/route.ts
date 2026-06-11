import {
  buildRecentGreetingOpeningExamples,
  getDailyGreetingGenerationPartialResult,
  generateDailyGreetingMessage,
} from "@/features/messages/server/gemini";
import {
  buildCalendarEventsSummary,
  listTodayCalendarEvents,
} from "@/features/messages/server/calendarEvents";
import { getLineCredentials } from "@/features/messages/server/credentials";
import { getLineAccount, listActiveLineAccounts } from "@/features/messages/server/lineAccounts";
import { sendLineTextMessages } from "@/features/messages/server/outboundLine";
import {
  buildAutoBroadcastPushBody,
  createAutoSendRunId,
  getDailyBroadcastSettings,
  listSendRuns,
  listSelectedBroadcastUsers,
  reserveAutoSendRun,
  saveSendRun,
} from "@/features/messages/server/broadcasts";
import {
  buildAutoBroadcastResultPushPayload,
  sendPushNotificationsToViewers,
} from "@/features/messages/server/pushNotifications";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import type { SendRunTargetView, UserInfoView } from "@/features/messages/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!expected) {
    return jsonError(503, "SERVICE_UNAVAILABLE", "Cron認証の設定が不足しています。", requestId);
  }

  if (token !== expected) {
    return jsonError(401, "UNAUTHORIZED", "Cron認証に失敗しました。", requestId);
  }

  try {
    const accounts = await listActiveLineAccounts();
    const results = [];

    for (const account of accounts) {
      results.push(await runDailyMessageForLineAccount(account.lineAccountId, requestId));
    }

    return jsonData({ results }, requestId, results.some((result) => result.status === "failed") ? 207 : 200);
  } catch (error) {
    console.error("[cron-send-daily-message] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "自動送信を実行できません。", requestId);
  }
}

async function runDailyMessageForLineAccount(lineAccountId: string, requestId: string) {
  const startedAt = new Date();
  const runId = createAutoSendRunId(lineAccountId, startedAt);

  try {
    const settings = await getDailyBroadcastSettings(lineAccountId);

    if (!settings.enabled) {
      return { lineAccountId, runId, skipped: "disabled" as const, status: "skipped" as const };
    }

    const reserved = await reserveAutoSendRun({
      historyRetentionDays: settings.historyRetentionDays,
      lineAccountId,
      requestId,
      runId,
      startedAt,
    });

    if (!reserved) {
      return { lineAccountId, runId, skipped: "already_ran" as const, status: "skipped" as const };
    }

    const account = await getLineAccount(lineAccountId);
    const selectedUsers = await listSelectedBroadcastUsers(lineAccountId);

    if (selectedUsers.length === 0) {
      const run = await saveSendRun({
        historyRetentionDays: settings.historyRetentionDays,
        lineAccountId,
        messageText: "",
        mode: "auto",
        requestId,
        runId,
        sentAt: startedAt,
        startedAt,
        targets: [],
        trigger: "cron",
      });

      await notifyAutoBroadcastResult({
        accountDisplayName: account.displayName,
        failedCount: 0,
        lineAccountId,
        successCount: 0,
      });

      return { lineAccountId, run, status: "success" as const };
    }

    const todayCalendarEvents = await listTodayCalendarEvents(lineAccountId, startedAt);
    const recentSendRuns = await listSendRuns(lineAccountId, 20);
    const { text } = await generateDailyGreetingMessage({
      calendarEventInfo: buildCalendarEventsSummary(todayCalendarEvents),
      recentOpeningExamples: buildRecentGreetingOpeningExamples(recentSendRuns, startedAt),
      today: startedAt,
    });
    const credentials = await getLineCredentials(lineAccountId);
    const results = await sendLineTextMessages({
      channelAccessToken: credentials.channelAccessToken,
      confirmation: { runId },
      text,
      userIds: selectedUsers.map((user) => user.userId),
    });
    const targets = toSendRunTargets(selectedUsers, results);
    const successCount = targets.filter((target) => target.status === "success").length;
    const failedCount = targets.filter((target) => target.status === "failed").length;
    const run = await saveSendRun({
      historyRetentionDays: settings.historyRetentionDays,
      lineAccountId,
      messageText: text,
      mode: "auto",
      requestId,
      runId,
      sentAt: startedAt,
      startedAt,
      targets,
      trigger: "cron",
    });

    await notifyAutoBroadcastResult({
      accountDisplayName: account.displayName,
      failedCount,
      lineAccountId,
      successCount,
    });

    return { lineAccountId, run, status: failedCount > 0 ? "partial_failed" as const : "success" as const };
  } catch (error) {
    return saveDailyMessageFailureRun({ error, lineAccountId, requestId, runId, startedAt });
  }
}

async function saveDailyMessageFailureRun({
  error,
  lineAccountId,
  requestId,
  runId,
  startedAt,
}: {
  error: unknown;
  lineAccountId: string;
  requestId: string;
  runId: string;
  startedAt: Date;
}) {
  console.error("[cron-send-daily-message] account failed", {
    lineAccountId,
    message: error instanceof Error ? error.message : String(error),
    requestId,
    runId,
  });

  try {
    const account = await getLineAccount(lineAccountId);
    const settings = await getDailyBroadcastSettings(lineAccountId);
    const selectedUsers = await listSelectedBroadcastUsers(lineAccountId);
    const partialResult = getDailyGreetingGenerationPartialResult(error);
    const messageText = partialResult?.text ?? "";
    const targets = selectedUsers.map((user) => ({
      errorCode: error instanceof Error ? error.message.slice(0, 80) : "AUTO_SEND_FAILED",
      status: "failed" as const,
      userId: user.userId,
      userName: user.userName,
    }));
    const run = await saveSendRun({
      historyRetentionDays: settings.historyRetentionDays,
      lineAccountId,
      messageText,
      mode: "auto",
      requestId,
      runId,
      sentAt: startedAt,
      startedAt,
      targets,
      trigger: "cron",
    });

    await notifyAutoBroadcastResult({
      accountDisplayName: account.displayName,
      failedCount: targets.length,
      lineAccountId,
      successCount: 0,
    });

    return { lineAccountId, run, status: "failed" as const };
  } catch (saveError) {
    console.error("[cron-send-daily-message] failed to save failure run", {
      lineAccountId,
      message: saveError instanceof Error ? saveError.message : String(saveError),
      requestId,
      runId,
    });

    return {
      error: saveError instanceof Error ? saveError.message : String(saveError),
      lineAccountId,
      runId,
      status: "failed" as const,
    };
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

async function notifyAutoBroadcastResult({
  accountDisplayName,
  failedCount,
  lineAccountId,
  successCount,
}: {
  accountDisplayName: string;
  failedCount: number;
  lineAccountId: string;
  successCount: number;
}) {
  await sendPushNotificationsToViewers({
    lineAccountId,
    payload: buildAutoBroadcastResultPushPayload(
      `${accountDisplayName || "LINE"} ${buildAutoBroadcastPushBody(successCount, failedCount)}`,
    ),
  }).catch((error) => {
    console.warn("[cron-send-daily-message] result push failed", {
      lineAccountId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
