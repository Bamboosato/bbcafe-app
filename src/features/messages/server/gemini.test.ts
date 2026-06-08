import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDailyGreetingForSend,
  generateDailyGreetingMessage,
  getDailyGreetingGenerationPartialResult,
  summarizeDailyGreetingGenerationError,
} from "./gemini";

const TEST_WEATHER_INFO = "名古屋市の天気は「くもり」。予想最高気温は 28度 です。";
const TEST_GENERATION_OPTIONS = {
  today: new Date("2026-06-07T00:00:00Z"),
  weatherInfo: TEST_WEATHER_INFO,
};

async function captureGenerationError(options: Parameters<typeof generateDailyGreetingMessage>[0] = TEST_GENERATION_OPTIONS) {
  try {
    await generateDailyGreetingMessage(options);
  } catch (error) {
    return error;
  }

  throw new Error("Expected generateDailyGreetingMessage to throw.");
}

describe("generateDailyGreetingMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.MESSAGE_LOCATION;
  });

  it("requests a short no-thinking daily greeting with Nagoya weather context", async () => {
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
      location: "名古屋市",
      ...TEST_GENERATION_OPTIONS,
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody.generationConfig.maxOutputTokens).toBe(300);
    expect(requestBody.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(requestBody.contents[0].parts[0].text).toContain("本文の冒頭は必ず「お早うございます。」");
    expect(requestBody.contents[0].parts[0].text).toContain("日付: 6月7日");
    expect(requestBody.contents[0].parts[0].text).toContain(`天気予報: ${TEST_WEATHER_INFO}`);
    expect(requestBody.contents[0].parts[0].text).toContain("【熱中症警戒】");
    expect(requestBody.contents[0].parts[0].text).toContain("日本の暦や季節の言葉");
    expect(requestBody.contents[0].parts[0].text).toContain("ああ、もうそんな季節か");
    expect(requestBody.contents[0].parts[0].text).toContain("60文字〜95文字");
    expect(result.text).toBe("お早うございます。\n今日は穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。");
  });

  it("rejects an obviously incomplete Gemini response with a display summary", async () => {
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

    const error = await captureGenerationError();

    expect(error).toEqual(expect.objectContaining({ message: "Gemini API returned an incomplete message." }));
    expect(summarizeDailyGreetingGenerationError(error)).toBe("Gemini APIから不完全なメッセージが返されました。");
    expect(getDailyGreetingGenerationPartialResult(error)).toEqual({
      location: "名古屋市",
      text: expect.stringMatching(/^(お早うございます。|こんにちは。|こんばんは。)\n2026年6月7日、$/),
    });
  });

  it("uses complete Gemini text even when the API reports MAX_TOKENS", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。" }],
            },
            finishReason: "MAX_TOKENS",
          },
        ],
      }),
    );

    const result = await generateDailyGreetingMessage({
      today: new Date("2026-06-07T00:00:00Z"),
      weatherInfo: TEST_WEATHER_INFO,
    });

    expect(result.text).toBe("お早うございます。\n今日は穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。");
  });

  it("rejects an incomplete MAX_TOKENS response with a display summary", async () => {
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

    const error = await captureGenerationError();

    expect(error).toEqual(expect.objectContaining({ message: "Gemini API returned an incomplete message." }));
    expect(summarizeDailyGreetingGenerationError(error)).toBe("Gemini APIから不完全なメッセージが返されました。");
    expect(getDailyGreetingGenerationPartialResult(error)).toEqual({
      location: "名古屋市",
      text: expect.stringMatching(/^(お早うございます。|こんにちは。|こんばんは。)\n2026年6月7日、$/),
    });
  });

  it("rejects a Gemini response that stopped for a non-token reason with a display summary", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。" }],
            },
            finishReason: "SAFETY",
          },
        ],
      }),
    );

    const error = await captureGenerationError();

    expect(error).toEqual(expect.objectContaining({ message: "Gemini API stopped before completing the message: SAFETY." }));
    expect(summarizeDailyGreetingGenerationError(error)).toBe("Gemini APIが途中で停止しました: SAFETY");
  });

  it("rejects when Gemini is not configured with a display summary", async () => {
    const error = await captureGenerationError();

    expect(error).toEqual(expect.objectContaining({ message: "Missing required environment variable: GEMINI_API_KEY" }));
    expect(summarizeDailyGreetingGenerationError(error)).toBe("Gemini APIキーが設定されていません。");
  });

  it("rejects Gemini API HTTP errors with status and summary", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          error: {
            message: "API key not valid.",
          },
        },
        { status: 400 },
      ),
    );

    const error = await captureGenerationError();

    expect(summarizeDailyGreetingGenerationError(error)).toBe("Gemini APIエラー 400: API key not valid.");
  });
});

describe("formatDailyGreetingForSend", () => {
  it.each([
    ["morning", "2026-06-06T21:00:00Z", "お早うございます。"],
    ["afternoon", "2026-06-07T03:00:00Z", "こんにちは。"],
    ["evening", "2026-06-07T11:00:00Z", "こんばんは。"],
  ])("adds the %s greeting for the Japan send time", (_period, sendTime, greeting) => {
    expect(formatDailyGreetingForSend("今日は穏やかな季節の一日です。", new Date(sendTime))).toBe(
      `${greeting}\n今日は穏やかな季節の一日です。`,
    );
  });

  it("replaces an existing time-of-day greeting with the greeting for the actual send time", () => {
    expect(
      formatDailyGreetingForSend(
        "こんにちは。\n今日は穏やかな季節の一日です。",
        new Date("2026-06-07T11:00:00Z"),
      ),
    ).toBe("こんばんは。\n今日は穏やかな季節の一日です。");
  });
});
