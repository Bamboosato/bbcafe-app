import { fetchWithRateLimitRetry } from "./rateLimitRetry";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_MESSAGE_LOCATION = "日本";
const DAILY_GREETING_MAX_OUTPUT_TOKENS = 1024;
const DAILY_GREETING_TIME_ZONE = "Asia/Tokyo";
const TIME_OF_DAY_GREETINGS = ["お早うございます。", "こんにちは。", "こんばんは。"] as const;
const UNKNOWN_GENERATION_ERROR_SUMMARY = "メッセージ生成APIで不明なエラーが発生しました。";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
};

type GeminiErrorResponse = {
  error?: {
    message?: string;
  };
};

class GeminiMessageGenerationError extends Error {
  constructor(
    message: string,
    readonly summary: string,
  ) {
    super(message);
    this.name = "GeminiMessageGenerationError";
  }
}

export async function generateDailyGreetingMessage({
  location = process.env.MESSAGE_LOCATION?.trim() || DEFAULT_MESSAGE_LOCATION,
  today = new Date(),
}: {
  location?: string;
  today?: Date;
} = {}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new GeminiMessageGenerationError(
      "Missing required environment variable: GEMINI_API_KEY",
      "Gemini APIキーが設定されていません。",
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const timeOfDayGreeting = getTimeOfDayGreeting(today);
  const prompt = buildDailyGreetingPrompt({ location, timeOfDayGreeting, today });
  const response = await fetchWithRateLimitRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
            role: "user",
          },
        ],
        generationConfig: {
          maxOutputTokens: DAILY_GREETING_MAX_OUTPUT_TOKENS,
          temperature: 0.8,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      method: "POST",
    },
  );

  const payload = (await response.json().catch(() => ({}))) as GeminiErrorResponse & GeminiGenerateContentResponse;

  if (!response.ok) {
    const apiSummary = payload.error?.message || response.statusText || "Gemini API request failed.";

    throw new GeminiMessageGenerationError(
      apiSummary,
      `Gemini APIエラー ${response.status}: ${apiSummary}`,
    );
  }

  const candidate = payload.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const generatedText = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (finishReason && finishReason !== "STOP") {
    throw new GeminiMessageGenerationError(
      `Gemini API stopped before completing the message: ${finishReason}.`,
      `Gemini APIが途中で停止しました: ${finishReason}`,
    );
  }

  if (!generatedText) {
    throw new GeminiMessageGenerationError(
      "Gemini API did not return message text.",
      "Gemini APIからメッセージ本文が返されませんでした。",
    );
  }

  const text = formatDailyGreetingForSend(generatedText, today);

  if (looksIncompleteDailyGreeting(text)) {
    throw new GeminiMessageGenerationError(
      "Gemini API returned an incomplete message.",
      "Gemini APIから不完全なメッセージが返されました。",
    );
  }

  return {
    location,
    text,
  };
}

export function summarizeDailyGreetingGenerationError(error: unknown) {
  if (error instanceof GeminiMessageGenerationError) {
    return error.summary;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return UNKNOWN_GENERATION_ERROR_SUMMARY;
}

function buildDailyGreetingPrompt({
  location,
  timeOfDayGreeting,
  today,
}: {
  location: string;
  timeOfDayGreeting: string;
  today: Date;
}) {
  const todayStr = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeZone: DAILY_GREETING_TIME_ZONE,
  }).format(today);

  return `
本日の日付（${todayStr}）と、対象地域「${location}」の「現在の時期の典型的な天気や気候」、
および今の時期の暦（二十四節気など）をあなたの知識から考慮してください。

その情報をもとに、高齢者の方に向けた「今日の一言メッセージ（挨拶文）」を1つ作成してください。

【条件】
・本文の冒頭は必ず「${timeOfDayGreeting}」にする
・2〜4文程度で完結させる
・「今日の季節感や暦」の話題から会話を始める
・専門用語は使わず、語りかけるような優しい口調にする
・体調を気遣う一言で締めくくる
・スマホLINEで読みやすいよう、適度に改行を入れる
・本文のみを出力する
`.trim();
}

function looksIncompleteDailyGreeting(text: string) {
  const trimmedText = text.trim();

  return trimmedText.length < 30 || /[、,，]$/.test(trimmedText) || !/[。.!?！？]$/.test(trimmedText);
}

export function formatDailyGreetingForSend(text: string, sendTime = new Date()) {
  const timeOfDayGreeting = getTimeOfDayGreeting(sendTime);
  const trimmedText = text.trim();
  const greetingPattern = new RegExp(`^(${TIME_OF_DAY_GREETINGS.join("|")})\\s*`);
  const textWithoutExistingGreeting = trimmedText.replace(greetingPattern, "").trimStart();

  if (!textWithoutExistingGreeting) {
    return timeOfDayGreeting;
  }

  return `${timeOfDayGreeting}\n${textWithoutExistingGreeting}`;
}

function getTimeOfDayGreeting(date: Date) {
  const hour = getHourInTimeZone(date, DAILY_GREETING_TIME_ZONE);

  if (hour >= 5 && hour < 11) {
    return "お早うございます。";
  }

  if (hour >= 11 && hour < 18) {
    return "こんにちは。";
  }

  return "こんばんは。";
}

function getHourInTimeZone(date: Date, timeZone: string) {
  const hourPart = new Intl.DateTimeFormat("ja-JP", {
    hour: "numeric",
    hourCycle: "h23",
    hour12: false,
    timeZone,
  })
    .formatToParts(date)
    .find((part) => part.type === "hour");

  const hour = Number(hourPart?.value);

  if (!Number.isInteger(hour)) {
    throw new Error(`Could not determine hour in time zone: ${timeZone}`);
  }

  return hour;
}
