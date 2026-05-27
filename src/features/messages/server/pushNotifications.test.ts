import { describe, expect, it } from "vitest";
import { buildNewMessagePushPayload, normalizePushSubscription } from "./pushNotifications";

describe("push notification helpers", () => {
  it("builds a shared-id scoped new message payload", () => {
    expect(buildNewMessagePushPayload("bbcafe")).toEqual({
      body: "bbcafe 新しいメッセージがあります",
      tag: "new-message:bbcafe",
      title: "BB Cafe Messages",
      url: "/",
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
