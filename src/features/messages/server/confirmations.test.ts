import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SendRunTargetView } from "../types";
import type { ConfirmationTargetRecord } from "./confirmations";
import {
  CONFIRMATION_BUTTON_LABEL,
  buildConfirmationPostbackData,
  buildConfirmationQuickReplyIconUrl,
  buildConfirmationQuickReply,
  buildUnconfirmedReminderPushBody,
  prepareSendRunTargetsForConfirmation,
} from "./confirmations";

describe("confirmation quick reply", () => {
  it("uses the agreed button label and postback payload", () => {
    expect(CONFIRMATION_BUTTON_LABEL).toBe("確認したよ👍");
    expect(buildConfirmationPostbackData({ runId: "run_1", userId: "user_1" })).toBe(
      "action=confirm_message&runId=run_1&userId=user_1",
    );
    expect(buildConfirmationQuickReply({ iconBaseUrl: null, runId: "run_1", userId: "user_1" })).toEqual({
      items: [
        {
          action: {
            data: "action=confirm_message&runId=run_1&userId=user_1",
            displayText: "確認したよ👍",
            label: "確認したよ👍",
            type: "postback",
          },
          type: "action",
        },
      ],
    });
  });

  it("adds the cafe check icon when a public app URL is available", () => {
    expect(buildConfirmationQuickReply({ iconBaseUrl: "https://example.com", runId: "run_1", userId: "user_1" })).toEqual({
      items: [
        {
          imageUrl: "https://example.com/line/confirm-quick-reply.png",
          action: {
            data: "action=confirm_message&runId=run_1&userId=user_1",
            displayText: "確認したよ👍",
            label: "確認したよ👍",
            type: "postback",
          },
          type: "action",
        },
      ],
    });
  });

  it("uses only HTTPS icon URLs", () => {
    expect(buildConfirmationQuickReplyIconUrl("bbcafe-app.vercel.app")).toBe(
      "https://bbcafe-app.vercel.app/line/confirm-quick-reply.png",
    );
    expect(buildConfirmationQuickReplyIconUrl("http://localhost:3000")).toBeNull();
    expect(buildConfirmationQuickReplyIconUrl(null)).toBeNull();
  });
});

describe("confirmation quick reply icon asset", () => {
  it("keeps the public PNG icon within LINE quick reply limits", () => {
    const iconPath = resolve(process.cwd(), "public/line/confirm-quick-reply.png");
    const pngSignature = readFileSync(iconPath).subarray(0, 8);

    expect(Array.from(pngSignature)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(statSync(iconPath).size).toBeLessThan(1024 * 1024);
  });
});

describe("send run confirmation targets", () => {
  it("marks successful sends as pending and failed sends as not required", () => {
    const targets: SendRunTargetView[] = [
      { status: "success", userId: "user_1", userName: "佐藤" },
      { status: "failed", userId: "user_2", userName: "鈴木" },
    ];

    expect(prepareSendRunTargetsForConfirmation(targets)).toEqual([
      {
        confirmationStatus: "pending",
        confirmedAt: null,
        reminderSentAt: null,
        status: "success",
        userId: "user_1",
        userName: "佐藤",
      },
      {
        confirmationStatus: "not_required",
        confirmedAt: null,
        reminderSentAt: null,
        status: "failed",
        userId: "user_2",
        userName: "鈴木",
      },
    ]);
  });
});

describe("unconfirmed reminder push body", () => {
  it("builds a single-user reminder without a count suffix", () => {
    expect(buildUnconfirmedReminderPushBody([confirmationTarget("user_1", "佐藤")])).toBe(
      "佐藤さんに未確認メッセージがあります",
    );
  });

  it("builds a multi-user reminder without a total count suffix", () => {
    expect(
      buildUnconfirmedReminderPushBody([
        confirmationTarget("user_1", "佐藤"),
        confirmationTarget("user_2", "鈴木"),
        confirmationTarget("user_3", "田中"),
      ]),
    ).toBe("佐藤さんほか2名に未確認メッセージがあります");
  });
});

function confirmationTarget(userId: string, userName: string): ConfirmationTargetRecord {
  return {
    confirmedAt: null,
    lineAccountId: "default",
    mode: "manual",
    reminderSentAt: null,
    runId: "run_1",
    sentAt: "2026-06-09T00:00:00.000Z",
    status: "pending",
    userId,
    userName,
  };
}
