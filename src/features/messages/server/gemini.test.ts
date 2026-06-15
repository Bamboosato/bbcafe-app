import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRecentGreetingOpeningExamples,
  buildRecentGreetingOpeningKeywords,
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
    delete process.env.GEMINI_FALLBACK_MODELS;
    delete process.env.GEMINI_MAX_RETRIES_PER_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_RETRY_DELAY_MS;
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
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/models/gemini-2.5-flash:generateContent");
    expect(requestBody.generationConfig.maxOutputTokens).toBe(300);
    expect(requestBody.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(requestBody.contents[0].parts[0].text).toContain("本文の冒頭は必ず「お早うございます。」");
    expect(requestBody.contents[0].parts[0].text).toContain("日付: 6月7日");
    expect(requestBody.contents[0].parts[0].text).toContain("必ず「今日は6月7日、」");
    expect(requestBody.contents[0].parts[0].text).toContain(`天気予報: ${TEST_WEATHER_INFO}`);
    expect(requestBody.contents[0].parts[0].text).toContain("【熱中症警戒】");
    expect(requestBody.contents[0].parts[0].text).toContain("季節の言葉");
    expect(requestBody.contents[0].parts[0].text).toContain("今日の大切な予定がある場合");
    expect(requestBody.contents[0].parts[0].text).toContain("今日の誕生花: 宿根アマ");
    expect(requestBody.contents[0].parts[0].text).toContain("誕生花の花言葉: ご親切にありがとう");
    expect(requestBody.contents[0].parts[0].text).toContain("別の花や別の花言葉に置き換えない");
    expect(requestBody.contents[0].parts[0].text).toContain("今日の誕生花は○○○、花言葉は△△△△△です。");
    expect(requestBody.contents[0].parts[0].text).toContain("ああ、もうそんな季節か");
    expect(requestBody.contents[0].parts[0].text).toContain("60文字〜95文字");
    expect(result.text).toBe("お早うございます。\n今日は6月7日、穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。");
  });

  it("passes the birth flower master value for the Japan calendar date", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は6月15日、梅雨どきの花が目にやさしい一日です。水分をとってください。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    const result = await generateDailyGreetingMessage({
      location: "名古屋市",
      today: new Date("2026-06-14T15:00:00Z"),
      weatherInfo: TEST_WEATHER_INFO,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.contents[0].parts[0].text).toContain("日付: 6月15日");
    expect(requestBody.contents[0].parts[0].text).toContain("今日の誕生花: ムラサキツユクサ");
    expect(requestBody.contents[0].parts[0].text).toContain("誕生花の花言葉: 尊敬しています");
    expect(requestBody.contents[0].parts[0].text).not.toContain("今日の誕生花: アジサイ");
    expect(result.text).toBe(
      "こんばんは。\n今日は6月15日、梅雨どきの花が目にやさしい一日です。水分をとってください。",
    );
  });

  it("passes today's calendar event as the highest priority greeting topic", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は千夏子さんのお誕生日ですね。よい一日になりますように。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    const result = await generateDailyGreetingMessage({
      calendarEventInfo: "千夏子の誕生日",
      location: "名古屋市",
      ...TEST_GENERATION_OPTIONS,
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody.contents[0].parts[0].text).toContain("今日の大切な予定: 千夏子の誕生日");
    expect(requestBody.contents[0].parts[0].text).toContain(
      "誕生花、花言葉、天気、季節の話題よりも優先して本文の中心",
    );
    expect(requestBody.contents[0].parts[0].text).toContain("人名と思われる名前には「さん」");
    expect(requestBody.contents[0].parts[0].text).toContain("今日は千夏子さんのお誕生日ですね。");
    expect(requestBody.contents[0].parts[0].text).toContain("80文字〜130文字");
    expect(result.text).toBe("お早うございます。\n今日は6月7日、千夏子さんのお誕生日ですね。よい一日になりますように。");
  });

  it("passes recent opening keywords to avoid short-term repetition", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は梅雨の晴れ間がうれしい朝ですね。水分をとってお過ごしください。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    await generateDailyGreetingMessage({
      location: "名古屋市",
      recentOpeningExamples: ["今日は6月9日、衣替えの季節ですね。"],
      ...TEST_GENERATION_OPTIONS,
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody.contents[0].parts[0].text).not.toContain("【最近使った冒頭表現】");
    expect(requestBody.contents[0].parts[0].text).not.toContain("・今日は6月9日、衣替えの季節ですね。");
    expect(requestBody.contents[0].parts[0].text).toContain("【最近使った禁止キーワード】");
    expect(requestBody.contents[0].parts[0].text).toContain("・衣替え");
    expect(requestBody.contents[0].parts[0].text).toContain(
      "上の【最近使った禁止キーワード】に列挙された語は、冒頭の季節の一言には使わない",
    );
  });

  it("does not regenerate when the generated opening repeats a recent opening", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は6月7日、そろそろ梅雨入りが気になる頃ですね。水分をとってください。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    const result = await generateDailyGreetingMessage({
      location: "名古屋市",
      recentOpeningExamples: ["今日は6月6日、そろそろ梅雨入りが気になる頃ですね。"],
      ...TEST_GENERATION_OPTIONS,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("お早うございます。\n今日は6月7日、そろそろ梅雨入りが気になる頃ですね。水分をとってください。");
  });

  it("passes keywords extracted from recent openings as banned opening keywords", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は6月11日、くちなしの白い花が目に入る頃ですね。水分をとってください。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    await generateDailyGreetingMessage({
      location: "名古屋市",
      recentOpeningExamples: [
        "今日は6月11日、青葉が目に鮮やかな季節ですね。",
        "今日は6月11日、もうすぐ夏至で日が長くなる頃ですね。",
      ],
      today: new Date("2026-06-11T00:00:00Z"),
      weatherInfo: TEST_WEATHER_INFO,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.contents[0].parts[0].text).toContain("【最近使った禁止キーワード】");
    expect(requestBody.contents[0].parts[0].text).toContain("・青葉");
    expect(requestBody.contents[0].parts[0].text).toContain("・夏至");
  });

  it("does not regenerate when the generated opening contains a banned keyword from recent openings", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: "今日は6月11日、もうすぐ夏至で日が長くなる頃ですね。水分をとってください。" }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    const result = await generateDailyGreetingMessage({
      location: "名古屋市",
      recentOpeningExamples: ["今日は6月11日、夏至が近づき、日が長くなってきましたね。"],
      today: new Date("2026-06-11T00:00:00Z"),
      weatherInfo: TEST_WEATHER_INFO,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("お早うございます。\n今日は6月11日、もうすぐ夏至で日が長くなる頃ですね。水分をとってください。");
  });

  it("falls back to flash-lite when the primary Gemini model is temporarily unavailable", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    process.env.GEMINI_MAX_RETRIES_PER_MODEL = "0";
    process.env.GEMINI_RETRY_DELAY_MS = "0";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: "This model is currently experiencing high demand.",
            },
          },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
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

    const result = await generateDailyGreetingMessage(TEST_GENERATION_OPTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/models/gemini-2.5-flash:generateContent");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-2.5-flash-lite:generateContent");
    expect(result.text).toBe("お早うございます。\n今日は6月7日、穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。");
  });

  it("keeps the Gemini API summary when every model is temporarily unavailable", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    process.env.GEMINI_MAX_RETRIES_PER_MODEL = "0";
    process.env.GEMINI_RETRY_DELAY_MS = "0";
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(
      Response.json(
        {
          error: {
            message: "This model is currently experiencing high demand.",
          },
        },
        { status: 503 },
      ),
    ));

    const error = await captureGenerationError();

    expect(summarizeDailyGreetingGenerationError(error)).toBe(
      "Gemini APIエラー 503: This model is currently experiencing high demand.",
    );
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

    expect(result.text).toBe("お早うございます。\n今日は6月7日、穏やかな季節の一日です。\nどうぞ無理なくお過ごしください。");
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

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(summarizeDailyGreetingGenerationError(error)).toBe("Gemini APIエラー 400: API key not valid.");
  });
});

describe("buildRecentGreetingOpeningExamples", () => {
  it("extracts unique opening sentences from send history within the last 7 days", () => {
    const examples = buildRecentGreetingOpeningExamples(
      [
        {
          messageText:
            "お早うございます。\n今日は6月9日、衣替えの季節ですね。名古屋はくもり空になりそうです。",
          sentAt: "2026-06-09T22:00:00.000Z",
        },
        {
          messageText:
            "お早うございます。今日は6月9日、衣替えの季節ですね。暑い一日になりそうです。",
          sentAt: "2026-06-08T22:00:00.000Z",
        },
        {
          messageText: "お早うございます。\n今日は昔ながらの季節の話題です。",
          sentAt: "2026-06-01T00:00:00.000Z",
        },
        {
          messageText: "",
          sentAt: "2026-06-10T22:00:00.000Z",
        },
        {
          messageText: "お早うございます。\n今日は未来の話題です。",
          sentAt: "2026-06-12T00:00:00.000Z",
        },
        {
          messageText: "お早うございます。\n今日は日付が不明な話題です。",
          sentAt: "not-a-date",
        },
      ],
      new Date("2026-06-11T00:00:00.000Z"),
    );

    expect(examples).toEqual(["今日は6月9日、衣替えの季節ですね。"]);
  });
});

describe("buildRecentGreetingOpeningKeywords", () => {
  it("extracts concrete seasonal keywords from recent opening examples", () => {
    expect(
      buildRecentGreetingOpeningKeywords([
        "今日は6月11日、青葉が目に鮮やかな季節ですね。",
        "今日は6月11日、もうすぐ夏至で日が長くなる頃ですね。",
        "今日は6月11日、名古屋は晴れで嬉しいですね。",
      ]),
    ).toEqual(["青葉", "夏至"]);
  });
});

describe("formatDailyGreetingForSend", () => {
  it.each([
    ["morning", "2026-06-06T21:00:00Z", "お早うございます。"],
    ["afternoon", "2026-06-07T03:00:00Z", "こんにちは。"],
    ["evening", "2026-06-07T11:00:00Z", "こんばんは。"],
  ])("adds the %s greeting for the Japan send time", (_period, sendTime, greeting) => {
    expect(formatDailyGreetingForSend("今日は穏やかな季節の一日です。", new Date(sendTime))).toBe(
      `${greeting}\n今日は6月7日、穏やかな季節の一日です。`,
    );
  });

  it("replaces an existing time-of-day greeting with the greeting for the actual send time", () => {
    expect(
      formatDailyGreetingForSend(
        "こんにちは。\n今日は穏やかな季節の一日です。",
        new Date("2026-06-07T11:00:00Z"),
      ),
    ).toBe("こんばんは。\n今日は6月7日、穏やかな季節の一日です。");
  });

  it("keeps an existing month-day date in the greeting text", () => {
    expect(formatDailyGreetingForSend("今日は6月7日、穏やかな季節の一日です。", new Date("2026-06-07T00:00:00Z"))).toBe(
      "お早うございます。\n今日は6月7日、穏やかな季節の一日です。",
    );
  });
});
