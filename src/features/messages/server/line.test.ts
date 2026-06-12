import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSenderProfilePath, importLineFollowers, processLineWebhookEvents } from "./line";
import { upsertBroadcastUser } from "./broadcasts";

vi.mock("./broadcasts", () => ({
  upsertBroadcastUser: vi.fn(),
}));

vi.mock("./confirmations", () => ({
  markConfirmationFromPostback: vi.fn(),
}));

vi.mock("./lineAccounts", () => ({
  getLineAccount: vi.fn(),
}));

vi.mock("./messages", () => ({
  deleteMessagesByLineMessageId: vi.fn(),
  saveTextMessage: vi.fn(),
}));

vi.mock("./pushNotifications", () => ({
  sendNewMessagePushNotifications: vi.fn(),
}));

const upsertBroadcastUserMock = vi.mocked(upsertBroadcastUser);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  upsertBroadcastUserMock.mockResolvedValue(undefined);
});

describe("LINE sender profile path", () => {
  it("uses the group member profile API for group messages", () => {
    expect(
      getSenderProfilePath({
        groupId: "Cgroup/with space",
        sourceType: "group",
        sourceUserId: "Uuser+1",
      }),
    ).toBe("/v2/bot/group/Cgroup%2Fwith%20space/member/Uuser%2B1");
  });

  it("uses the room member profile API for room messages", () => {
    expect(
      getSenderProfilePath({
        groupId: "Rroom",
        sourceType: "room",
        sourceUserId: "Uuser",
      }),
    ).toBe("/v2/bot/room/Rroom/member/Uuser");
  });

  it("uses the user profile API for personal messages", () => {
    expect(
      getSenderProfilePath({
        groupId: null,
        sourceType: "user",
        sourceUserId: "Uuser",
      }),
    ).toBe("/v2/bot/profile/Uuser");
  });

  it("returns null when the webhook event does not include a user ID", () => {
    expect(
      getSenderProfilePath({
        groupId: "Cgroup",
        sourceType: "group",
        sourceUserId: null,
      }),
    ).toBeNull();
  });
});

describe("LINE follow webhook events", () => {
  it("registers the followed user in broadcast users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ displayName: "佐藤さん" })),
    );

    const result = await processLineWebhookEvents({
      channelAccessToken: "line-token",
      lineAccountId: "default",
      payload: {
        events: [
          {
            source: {
              type: "user",
              userId: "Ufollow",
            },
            timestamp: 1_765_555_200_000,
            type: "follow",
          },
        ],
      },
    });

    expect(result).toMatchObject({
      followed: 1,
      ignored: 0,
    });
    expect(upsertBroadcastUserMock).toHaveBeenCalledWith({
      firstSeenAt: new Date(1_765_555_200_000),
      lastSeenAt: new Date(1_765_555_200_000),
      lineAccountId: "default",
      userId: "Ufollow",
      userName: "佐藤さん",
    });
    expect(fetch).toHaveBeenCalledWith("https://api.line.me/v2/bot/profile/Ufollow", {
      headers: {
        Authorization: "Bearer line-token",
      },
    });
  });

  it("ignores follow events without a user ID", async () => {
    const result = await processLineWebhookEvents({
      channelAccessToken: "line-token",
      lineAccountId: "default",
      payload: {
        events: [
          {
            source: {
              type: "user",
            },
            type: "follow",
          },
        ],
      },
    });

    expect(result).toMatchObject({
      followed: 0,
      ignored: 1,
    });
    expect(upsertBroadcastUserMock).not.toHaveBeenCalled();
  });
});

describe("LINE follower import", () => {
  it("imports existing followers across pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ next: "next-page", userIds: ["U1"] }))
      .mockResolvedValueOnce(Response.json({ displayName: "佐藤さん" }))
      .mockResolvedValueOnce(Response.json({ userIds: ["U2"] }))
      .mockResolvedValueOnce(Response.json({ displayName: "鈴木さん" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await importLineFollowers({
      channelAccessToken: "line-token",
      lineAccountId: "default",
    });

    expect(result).toEqual({
      failedProfileCount: 0,
      importedCount: 2,
      pageCount: 2,
      totalFollowerCount: 2,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.line.me/v2/bot/followers/ids?limit=1000", {
      headers: {
        Authorization: "Bearer line-token",
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.line.me/v2/bot/followers/ids?limit=1000&start=next-page", {
      headers: {
        Authorization: "Bearer line-token",
      },
    });
    expect(upsertBroadcastUserMock).toHaveBeenCalledTimes(2);
    expect(upsertBroadcastUserMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        lineAccountId: "default",
        userId: "U1",
        userName: "佐藤さん",
      }),
    );
    expect(upsertBroadcastUserMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        lineAccountId: "default",
        userId: "U2",
        userName: "鈴木さん",
      }),
    );
  });

  it("surfaces follower ID API failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));

    await expect(
      importLineFollowers({
        channelAccessToken: "line-token",
        lineAccountId: "default",
      }),
    ).rejects.toThrow("LINE_FOLLOWERS_IDS_403");
  });
});
