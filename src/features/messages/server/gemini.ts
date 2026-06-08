import { fetchWithRateLimitRetry } from "./rateLimitRetry";
import { getNagoyaWeatherInfo } from "./weather";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_MESSAGE_LOCATION = "名古屋市";
const DAILY_GREETING_MAX_OUTPUT_TOKENS = 300;
const DAILY_GREETING_TIME_ZONE = "Asia/Tokyo";
const TIME_OF_DAY_GREETINGS = ["お早うございます。", "こんにちは。", "こんばんは。"] as const;
const UNKNOWN_GENERATION_ERROR_SUMMARY = "メッセージ生成APIで不明なエラーが発生しました。";
const HEATSTROKE_ALERT_INFO =
  "【熱中症警戒】非常に暑くなる季節です。必ずエアコン使用と水分補給を促してください。";

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

type GenerateContentConfig = {
  maxOutputTokens: number;
  temperature: number;
  thinkingConfig: {
    thinkingBudget: number;
  };
};

class GeminiMessageGenerationError extends Error {
  constructor(
    message: string,
    readonly summary: string,
    readonly partialResult?: { location: string; text: string },
  ) {
    super(message);
    this.name = "GeminiMessageGenerationError";
  }
}

export async function generateDailyGreetingMessage({
  location = process.env.MESSAGE_LOCATION?.trim() || DEFAULT_MESSAGE_LOCATION,
  today = new Date(),
  weatherInfo,
}: {
  location?: string;
  today?: Date;
  weatherInfo?: string;
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
  const greetingContext = await buildDailyGreetingContext({ today, weatherInfo });
  const prompt = buildDailyGreetingPrompt({ ...greetingContext, location, timeOfDayGreeting });
  const generateContentConfig: GenerateContentConfig = {
    maxOutputTokens: DAILY_GREETING_MAX_OUTPUT_TOKENS,
    temperature: 0.8,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  };
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
        generationConfig: generateContentConfig,
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

  if (!generatedText) {
    throw new GeminiMessageGenerationError(
      "Gemini API did not return message text.",
      "Gemini APIからメッセージ本文が返されませんでした。",
    );
  }

  const text = formatDailyGreetingForSend(generatedText, today);

  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new GeminiMessageGenerationError(
      `Gemini API stopped before completing the message: ${finishReason}.`,
      `Gemini APIが途中で停止しました: ${finishReason}`,
    );
  }

  if (looksIncompleteDailyGreeting(text)) {
    throw new GeminiMessageGenerationError(
      "Gemini API returned an incomplete message.",
      "Gemini APIから不完全なメッセージが返されました。",
      { location, text },
    );
  }

  return {
    location,
    text,
  };
}

export function getDailyGreetingGenerationPartialResult(error: unknown) {
  if (error instanceof GeminiMessageGenerationError) {
    return error.partialResult;
  }

  return undefined;
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
  dateInfo,
  location,
  timeOfDayGreeting,
  weatherInfo,
}: {
  dateInfo: string;
  location: string;
  timeOfDayGreeting: string;
  weatherInfo: string;
}) {
  return `
あなたは、${location}にお住まいの高齢者の方に毎日寄り添う、親切で優しいケアマネージャーです。
以下の【今日の情報】を自然に盛り込んで、LINEで送る短い挨拶文を1つだけ作成してください。

【今日の情報】
・日付: ${dateInfo}
・天気予報: ${weatherInfo}

【お年寄り向けの絶対ルール】
1. 本文の冒頭は必ず「${timeOfDayGreeting}」にしてください。
2. 冒頭の挨拶の直後に、指定された日付の時期にぴったりな日本の暦や季節の言葉を1つ、わかりやすく含めてください。
   例: 二十四節気、衣替え、梅雨入り、新緑、秋の気配、年の瀬、花の季節など。
3. お年寄りが「ああ、もうそんな季節か」と感じられる、雑学的でやさしい表現にしてください。
4. 文字数は「60文字〜95文字」の範囲内に収めてください。
5. 漢字を多くせず、ひらがなを多めにして、専門用語は使わないでください。
6. 天気予報や注意情報に基づき、具体的な行動アドバイスを必ず最後に入れてください。
7. 解説や前置きは不要です。LINEの本文のみを出力してください。
`.trim();
}

async function buildDailyGreetingContext({ today, weatherInfo }: { today: Date; weatherInfo?: string }) {
  const baseWeatherInfo = weatherInfo ?? (await getNagoyaWeatherInfo());

  return {
    dateInfo: formatMonthDayInJapan(today),
    weatherInfo: appendSeasonalCareInfo(baseWeatherInfo, today),
  };
}

function appendSeasonalCareInfo(weatherInfo: string, today: Date) {
  const { month } = getDatePartsInTimeZone(today, DAILY_GREETING_TIME_ZONE);

  if (month >= 6 && month <= 9) {
    return `${weatherInfo} ${HEATSTROKE_ALERT_INFO}`;
  }

  return weatherInfo;
}

function formatMonthDayInJapan(date: Date) {
  const { day, month } = getDatePartsInTimeZone(date, DAILY_GREETING_TIME_ZONE);

  return `${month}月${day}日`;
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
  return getDatePartsInTimeZone(date, timeZone).hour;
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    hour12: false,
    month: "numeric",
    timeZone,
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);

  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(hour)) {
    throw new Error(`Could not determine date parts in time zone: ${timeZone}`);
  }

  return { day, hour, month };
}
