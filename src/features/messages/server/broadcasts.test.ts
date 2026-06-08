import { describe, expect, it } from "vitest";
import {
  buildAutoBroadcastPushBody,
  calculateSendRunExpiresAt,
  calculateSendRunStatus,
  createAutoSendRunId,
} from "./broadcasts";

describe("send run status", () => {
  it("marks all-success sends as success", () => {
    expect(calculateSendRunStatus(3, 0)).toBe("success");
  });

  it("marks mixed send results as partial_failed", () => {
    expect(calculateSendRunStatus(2, 1)).toBe("partial_failed");
  });

  it("marks zero-success sends as failed", () => {
    expect(calculateSendRunStatus(0, 4)).toBe("failed");
    expect(calculateSendRunStatus(0, 0)).toBe("failed");
  });
});

describe("auto broadcast run identity", () => {
  it("uses the Japan calendar date for duplicate prevention", () => {
    expect(createAutoSendRunId("default", new Date("2026-06-07T21:59:00Z"))).toBe("auto_default_20260608");
  });
});

describe("send history retention", () => {
  it("expires send runs after the configured retention days", () => {
    expect(calculateSendRunExpiresAt(new Date("2026-06-08T00:00:00Z"), 180).toISOString()).toBe(
      "2026-12-05T00:00:00.000Z",
    );
  });
});

describe("auto broadcast push body", () => {
  it("does not include the sent message body and summarizes success", () => {
    expect(buildAutoBroadcastPushBody(5, 0)).toBe("自動送信が完了しました（成功5件 / 失敗0件）");
  });

  it("summarizes partial failure", () => {
    expect(buildAutoBroadcastPushBody(4, 1)).toBe("自動送信が完了しました（成功4件 / 失敗1件）");
  });

  it("summarizes zero-success failure", () => {
    expect(buildAutoBroadcastPushBody(0, 2)).toBe("自動送信に失敗しました（成功0件 / 失敗2件）");
  });
});
