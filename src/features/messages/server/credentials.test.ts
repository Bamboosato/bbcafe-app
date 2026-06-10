import { afterEach, describe, expect, it, vi } from "vitest";
import { validateLineCredentialInput } from "./credentials";

describe("validateLineCredentialInput", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the LINE bot display name when the access token is valid", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        displayName: "BBカフェ",
        userId: "Ubot",
      }),
    );

    await expect(
      validateLineCredentialInput({
        channelAccessToken: "token",
        channelId: "2010193672",
        channelSecret: "secret",
      }),
    ).resolves.toEqual({ displayName: "BBカフェ" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.line.me/v2/bot/info");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: {
        Authorization: "Bearer token",
      },
    });
  });

  it("rejects an invalid access token response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 401,
      }),
    );

    await expect(
      validateLineCredentialInput({
        channelAccessToken: "bad-token",
        channelId: "2010193672",
        channelSecret: "secret",
      }),
    ).rejects.toThrow("INVALID_LINE_ACCESS_TOKEN");
  });

  it("rejects a valid response without a LINE bot display name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ displayName: " " }));

    await expect(
      validateLineCredentialInput({
        channelAccessToken: "token",
        channelId: "2010193672",
        channelSecret: "secret",
      }),
    ).rejects.toThrow("INVALID_LINE_BOT_INFO");
  });
});
