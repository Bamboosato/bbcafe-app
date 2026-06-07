import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDailyGreetingMessage } from "./gemini";

describe("generateDailyGreetingMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.MESSAGE_LOCATION;
  });

  it("requests enough output tokens for a complete daily greeting", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    const result = await generateDailyGreetingMessage({
      location: "日本",
      today: new Date("2026-06-07T00:00:00Z"),
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody.generationConfig.maxOutputTokens).toBe(1024);
    expect(requestBody.contents[0].parts[0].text).toContain("2〜4文程度で完結");
    expect(result.text).toBe("今日は穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。");
  });

  it("rejects an obviously incomplete Gemini response", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "2026年6月7日、" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    await expect(generateDailyGreetingMessage()).rejects.toThrow("Gemini API returned an incomplete message.");
  });

  it("rejects a Gemini response that stopped before the message was complete", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "2026年6月7日、" }],
            },
            finishReason: "MAX_TOKENS",
          },
        ],
      }),
    );

    await expect(generateDailyGreetingMessage()).rejects.toThrow(
      "Gemini API stopped before completing the message: MAX_TOKENS.",
    );
  });
});
