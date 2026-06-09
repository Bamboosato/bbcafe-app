import { describe, expect, it } from "vitest";
import {
  buildAutoBroadcastResultPushPayload,
  buildNewMessagePushPayload,
  buildUnconfirmedMessageReminderPushPayload,
  normalizePushSubscription,
} from "./pushNotifications";

describe("push notification helpers", () => {
  it("builds a shared-id scoped new message payload", () => {
    expect(buildNewMessagePushPayload("bbcafe")).toEqual({
      body: "bbcafe 新しいメッセージがあります",
      tag: "new-message:bbcafe",
      title: "BB Cafe Messages",
      url: "/",
    });
  });

  it("builds an auto broadcast result payload that opens send history", () => {
    expect(buildAutoBroadcastResultPushPayload("自動送信が完了しました（成功5件 / 失敗0件）")).toEqual({
      body: "自動送信が完了しました（成功5件 / 失敗0件）",
      tag: "auto-broadcast-result",
      title: "BB Cafe Messages",
      url: "/sent",
    });
  });

  it("builds an unconfirmed reminder payload that opens send history", () => {
    expect(buildUnconfirmedMessageReminderPushPayload("佐藤さんに未確認メッセージがあります")).toEqual({
      body: "佐藤さんに未確認メッセージがあります",
      tag: "unconfirmed-message-reminder",
      title: "BB Cafe Messages",
      url: "/sent",
    });
  });

  it("accepts a valid browser push subscription", () => {
    expect(
      normalizePushSubscription({
        endpoint: "https://example.com/push/abc",
        keys: {
          auth: "auth-token",
          p256dh: "public-key",
        },
      }),
    ).toEqual({
      endpoint: "https://example.com/push/abc",
      expirationTime: null,
      keys: {
        auth: "auth-token",
        p256dh: "public-key",
      },
    });
  });

  it("rejects malformed push subscriptions", () => {
    expect(normalizePushSubscription({ endpoint: "http://example.com", keys: {} })).toBeNull();
    expect(normalizePushSubscription({ endpoint: "https://example.com", keys: { auth: "x" } })).toBeNull();
    expect(normalizePushSubscription(null)).toBeNull();
  });
});
