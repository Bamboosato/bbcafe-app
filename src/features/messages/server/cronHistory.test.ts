import { describe, expect, it } from "vitest";
import type { ConfirmationReminderRunView, CronRunView, SendRunView } from "../types";
import { buildCronHistoryItems } from "./cronHistory";

describe("buildCronHistoryItems", () => {
  it("combines auto delete, auto send, and unconfirmed check runs in startedAt descending order", () => {
    const deleteRuns: CronRunView[] = [
      {
        deletedCount: 2,
        failedCount: 0,
        finishedAt: "2026-06-08T03:00:05.000Z",
        protectedCount: 1000,
        runId: "cron_1",
        skippedReason: null,
        startedAt: "2026-06-08T03:00:00.000Z",
        status: "success",
      },
    ];
    const sendRuns: SendRunView[] = [
      sendRun({ mode: "manual", runId: "manual_1", startedAt: "2026-06-08T00:00:00.000Z" }),
      sendRun({ mode: "auto", runId: "auto_1", startedAt: "2026-06-08T22:00:00.000Z" }),
    ];
    const reminderRuns: ConfirmationReminderRunView[] = [
      {
        confirmedCount: 1,
        confirmedTargets: [
          {
            confirmedAt: "2026-06-08T03:50:00.000Z",
            reminderSentAt: null,
            status: "confirmed",
            userId: "user_1",
            userName: "佐藤",
          },
        ],
        failedCount: 0,
        finishedAt: "2026-06-08T04:00:02.000Z",
        lineAccountId: "default",
        notifiedCount: 1,
        runId: "confirm_1",
        skippedReason: null,
        startedAt: "2026-06-08T04:00:00.000Z",
        status: "success",
        targetCount: 2,
        unconfirmedCount: 1,
        unconfirmedTargets: [
          {
            confirmedAt: null,
            reminderSentAt: null,
            status: "unconfirmed",
            userId: "user_2",
            userName: "鈴木",
          },
        ],
      },
    ];

    expect(buildCronHistoryItems({ deleteRuns, reminderRuns, sendRuns })).toEqual([
      {
        finishedAt: "2026-06-08T22:00:03.000Z",
        id: "auto_1",
        kind: "send_daily_message",
        startedAt: "2026-06-08T22:00:00.000Z",
        status: "success",
        summary: "成功 3件 / 失敗 0件 / 対象 3件",
      },
      {
        confirmedCount: 1,
        confirmedTargets: [
          {
            confirmedAt: "2026-06-08T03:50:00.000Z",
            reminderSentAt: null,
            status: "confirmed",
            userId: "user_1",
            userName: "佐藤",
          },
        ],
        finishedAt: "2026-06-08T04:00:02.000Z",
        id: "confirm_1",
        kind: "check_unconfirmed_messages",
        startedAt: "2026-06-08T04:00:00.000Z",
        status: "success",
        summary: "確認済 1件 / 未確認 1件 / 通知 1件 / 失敗 0件",
        unconfirmedCount: 1,
        unconfirmedTargets: [
          {
            confirmedAt: null,
            reminderSentAt: null,
            status: "unconfirmed",
            userId: "user_2",
            userName: "鈴木",
          },
        ],
      },
      {
        finishedAt: "2026-06-08T03:00:05.000Z",
        id: "cron_1",
        kind: "delete_expired_messages",
        startedAt: "2026-06-08T03:00:00.000Z",
        status: "success",
        summary: "削除 2件 / 保護 1000件",
      },
    ]);
  });
});

function sendRun({
  mode,
  runId,
  startedAt,
}: {
  mode: SendRunView["mode"];
  runId: string;
  startedAt: string;
}): SendRunView {
  return {
    createdAt: startedAt,
    expiresAt: "2026-12-05T00:00:00.000Z",
    failedCount: 0,
    finishedAt: "2026-06-08T22:00:03.000Z",
    historyRetentionDays: 180,
    lineAccountId: "default",
    messageText: "message",
    mode,
    requestId: "req_1",
    runId,
    sentAt: startedAt,
    startedAt,
    status: "success",
    successCount: 3,
    targetCount: 3,
    targets: [],
    trigger: mode === "auto" ? "cron" : "viewer",
    updatedAt: startedAt,
  };
}
