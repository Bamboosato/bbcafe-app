import { describe, expect, it } from "vitest";
import { filterSendRuns, matchesSendRunFilter } from "./sendRunFilter";
import type { SendRunMode, SendRunView } from "./types";

function createSendRun(runId: string, mode: SendRunMode): SendRunView {
  return {
    createdAt: "2026-06-10T00:00:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    failedCount: 0,
    finishedAt: "2026-06-10T00:00:01.000Z",
    historyRetentionDays: 180,
    lineAccountId: "default",
    messageText: "message text",
    mode,
    requestId: `request-${runId}`,
    runId,
    sentAt: "2026-06-10T00:00:00.000Z",
    startedAt: "2026-06-10T00:00:00.000Z",
    status: "success",
    successCount: 1,
    targetCount: 1,
    targets: [],
    trigger: mode === "auto" ? "cron" : "viewer",
    updatedAt: "2026-06-10T00:00:01.000Z",
  };
}

describe("send run mode filter", () => {
  const autoRun = createSendRun("auto-run", "auto");
  const manualRun = createSendRun("manual-run", "manual");
  const runs = [autoRun, manualRun];

  it("keeps auto and manual runs when ALL is selected", () => {
    expect(filterSendRuns(runs, "all").map((run) => run.runId)).toEqual(["auto-run", "manual-run"]);
  });

  it("keeps only auto runs when auto is selected", () => {
    expect(filterSendRuns(runs, "auto").map((run) => run.runId)).toEqual(["auto-run"]);
    expect(matchesSendRunFilter(manualRun, "auto")).toBe(false);
  });

  it("keeps only manual runs when manual is selected", () => {
    expect(filterSendRuns(runs, "manual").map((run) => run.runId)).toEqual(["manual-run"]);
    expect(matchesSendRunFilter(autoRun, "manual")).toBe(false);
  });
});
