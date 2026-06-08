import { describe, expect, it } from "vitest";
import type { CronRunView, SendRunView } from "../types";
import { buildCronHistoryItems } from "./cronHistory";

describe("buildCronHistoryItems", () => {
  it("combines auto delete and auto send runs in startedAt descending order", () => {
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

    expect(buildCronHistoryItems({ deleteRuns, sendRuns })).toEqual([
      {
        finishedAt: "2026-06-08T22:00:03.000Z",
        id: "auto_1",
        kind: "send_daily_message",
        startedAt: "2026-06-08T22:00:00.000Z",
        status: "success",
        summary: "成功 3件 / 失敗 0件 / 対象 3件",
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
