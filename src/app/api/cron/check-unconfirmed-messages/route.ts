import { DEFAULT_LINE_ACCOUNT_ID, getLineAccount } from "@/features/messages/server/lineAccounts";
import {
  buildConfirmationCheckSnapshot,
  buildUnconfirmedReminderPushBody,
  createConfirmationReminderRunId,
  listConfirmationTargets,
  markReminderSentForTargets,
  saveConfirmationReminderRun,
} from "@/features/messages/server/confirmations";
import {
  buildUnconfirmedMessageReminderPushPayload,
  sendPushNotificationsToViewers,
} from "@/features/messages/server/pushNotifications";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";

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

  const lineAccountId = DEFAULT_LINE_ACCOUNT_ID;
  const startedAt = new Date();
  const runId = createConfirmationReminderRunId(startedAt);

  try {
    const [account, targets] = await Promise.all([
      getLineAccount(lineAccountId),
      listConfirmationTargets(lineAccountId),
    ]);
    const checkSnapshot = buildConfirmationCheckSnapshot(targets);
    const pendingTargets = targets.filter((target) => target.status === "pending");

    if (!targets.length) {
      await saveConfirmationReminderRun({
        confirmedCount: 0,
        confirmedTargets: [],
        failedCount: 0,
        finishedAt: new Date(),
        lineAccountId,
        notifiedCount: 0,
        runId,
        skippedReason: "no_confirmation_targets",
        startedAt,
        status: "skipped",
        targetCount: 0,
        unconfirmedCount: 0,
        unconfirmedTargets: [],
      });

      return jsonData({ remindedCount: 0, runId, skipped: "no_confirmation_targets" }, requestId);
    }

    if (!pendingTargets.length) {
      await saveConfirmationReminderRun({
        ...checkSnapshot,
        failedCount: 0,
        finishedAt: new Date(),
        lineAccountId,
        notifiedCount: 0,
        runId,
        skippedReason: null,
        startedAt,
        status: "success",
      });

      return jsonData({
        confirmedCount: checkSnapshot.confirmedCount,
        remindedCount: 0,
        runId,
        targetCount: checkSnapshot.targetCount,
        unconfirmedCount: checkSnapshot.unconfirmedCount,
      }, requestId);
    }

    const body = buildUnconfirmedReminderPushBody(pendingTargets);
    const pushResult = await sendPushNotificationsToViewers({
      lineAccountId,
      payload: buildUnconfirmedMessageReminderPushPayload(body),
      viewerSharedId: account.viewerSharedId,
    });
    const remindedCount = pushResult.skipped ? 0 : await markReminderSentForTargets(lineAccountId, pendingTargets);
    const status = toReminderRunStatus(pushResult);

    await saveConfirmationReminderRun({
      ...checkSnapshot,
      failedCount: pushResult.failed,
      finishedAt: new Date(),
      lineAccountId,
      notifiedCount: pushResult.sent,
      runId,
      skippedReason: pushResult.skipped,
      startedAt,
      status,
    });

    return jsonData({
      confirmedCount: checkSnapshot.confirmedCount,
      pushResult,
      remindedCount,
      runId,
      targetCount: checkSnapshot.targetCount,
      unconfirmedCount: checkSnapshot.unconfirmedCount,
    }, requestId);
  } catch (error) {
    console.error("[cron-check-unconfirmed-messages] failed", {
      lineAccountId,
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    await saveConfirmationReminderRun({
      confirmedCount: 0,
      confirmedTargets: [],
      failedCount: 1,
      finishedAt: new Date(),
      lineAccountId,
      notifiedCount: 0,
      runId,
      skippedReason: error instanceof Error ? error.message : "unknown_error",
      startedAt,
      status: "failed",
      targetCount: 0,
      unconfirmedCount: 0,
      unconfirmedTargets: [],
    }).catch((writeError) => {
      console.error("[cron-check-unconfirmed-messages] failed to save run", {
        message: writeError instanceof Error ? writeError.message : String(writeError),
        requestId,
        runId,
      });
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "未確認メッセージを確認できません。", requestId);
  }
}

function toReminderRunStatus(pushResult: Awaited<ReturnType<typeof sendPushNotificationsToViewers>>) {
  if (pushResult.skipped) {
    return "skipped" as const;
  }

  if (pushResult.failed > 0 && pushResult.sent > 0) {
    return "partial_failed" as const;
  }

  if (pushResult.failed > 0) {
    return "failed" as const;
  }

  return "success" as const;
}
