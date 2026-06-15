import { getBirthFlowerForDate, type BirthFlower } from "./birthFlowers";
import { getNagoyaWeatherInfo } from "./weather";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash-lite"];
const DEFAULT_GEMINI_MAX_RETRIES_PER_MODEL = 1;
const DEFAULT_GEMINI_RETRY_DELAY_MS = 700;
const DEFAULT_MESSAGE_LOCATION = "名古屋市";
const DAILY_GREETING_MAX_OUTPUT_TOKENS = 300;
const DAILY_GREETING_TIME_ZONE = "Asia/Tokyo";
const GEMINI_TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const TIME_OF_DAY_GREETINGS = ["お早うございます。", "こんにちは。", "こんばんは。"] as const;
const UNKNOWN_GENERATION_ERROR_SUMMARY = "メッセージ生成APIで不明なエラーが発生しました。";
const HEATSTROKE_ALERT_INFO =
  "【熱中症警戒】非常に暑くなる季節です。必ずエアコン使用と水分補給を促してください。";
const DAILY_GREETING_REGENERATION_MAX_ATTEMPTS = 0;
const DAILY_GREETING_CONTENT_MAX_ATTEMPTS = 1 + DAILY_GREETING_REGENERATION_MAX_ATTEMPTS;
const RECENT_OPENING_BANNED_KEYWORD_MAX_EXAMPLES = 20;
const RECENT_OPENING_LOOKBACK_DAYS = 7;
const RECENT_OPENING_MAX_EXAMPLES = 7;
const RECENT_OPENING_SIMILARITY_THRESHOLD = 0.82;
const OPENING_KEYWORD_STOP_WORDS = new Set([
  "今日",
  "本日",
  "季節",
  "時期",
  "頃",
  "名古屋",
  "晴れ",
  "雨",
  "曇り",
  "くもり",
  "最高気温",
  "予想",
  "気温",
]);

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

type GeminiGenerateContentRequest = {
  apiKey: string;
  body: string;
  maxRetriesPerModel: number;
  models: string[];
  retryDelayMs: number;
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
  calendarEventInfo,
  location = process.env.MESSAGE_LOCATION?.trim() || DEFAULT_MESSAGE_LOCATION,
  recentOpeningExamples = [],
  today = new Date(),
  weatherInfo,
}: {
  calendarEventInfo?: string;
  location?: string;
  recentOpeningExamples?: string[];
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

  const models = getGeminiModelCandidates();
  const timeOfDayGreeting = getTimeOfDayGreeting(today);
  const greetingContext = await buildDailyGreetingContext({ today, weatherInfo });
  const birthFlower = getBirthFlowerForDate(today, DAILY_GREETING_TIME_ZONE);
  const generateContentConfig: GenerateContentConfig = {
    maxOutputTokens: DAILY_GREETING_MAX_OUTPUT_TOKENS,
    temperature: 0.8,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  };
  const contentMaxAttempts = recentOpeningExamples.length > 0 ? DAILY_GREETING_CONTENT_MAX_ATTEMPTS : 1;
  let recentOpeningKeywords = buildRecentGreetingOpeningKeywords(recentOpeningExamples);
  let lastRepeatedText: string | undefined;

  for (let contentAttempt = 0; contentAttempt < contentMaxAttempts; contentAttempt += 1) {
    const prompt = buildDailyGreetingPrompt({
      ...greetingContext,
      birthFlower,
      calendarEventInfo,
      location,
      recentOpeningKeywords,
      timeOfDayGreeting,
    });
    const payload = await generateGeminiContent({
      apiKey,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
            role: "user",
          },
        ],
        generationConfig: generateContentConfig,
      }),
      maxRetriesPerModel: getGeminiMaxRetriesPerModel(),
      models,
      retryDelayMs: getGeminiRetryDelayMs(),
    });

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

    const conflict = findRecentGreetingConflict(text, recentOpeningExamples, recentOpeningKeywords);

    if (!conflict) {
      return {
        location,
        text,
      };
    }

    recentOpeningKeywords = [
      ...new Set([
        ...recentOpeningKeywords,
        ...extractOpeningKeywords(text),
      ]),
    ].slice(0, RECENT_OPENING_BANNED_KEYWORD_MAX_EXAMPLES);
    lastRepeatedText = text;
  }

  return {
    location,
    text: lastRepeatedText ?? "",
  };
}

async function generateGeminiContent({
  apiKey,
  body,
  maxRetriesPerModel,
  models,
  retryDelayMs,
}: GeminiGenerateContentRequest) {
  let lastTransientError: null | { status: number; summary: string } = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetriesPerModel; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          body,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          method: "POST",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as GeminiErrorResponse & GeminiGenerateContentResponse;

      if (response.ok) {
        return payload;
      }

      const apiSummary = payload.error?.message || response.statusText || "Gemini API request failed.";

      if (!GEMINI_TRANSIENT_HTTP_STATUSES.has(response.status)) {
        throw new GeminiMessageGenerationError(
          apiSummary,
          `Gemini APIエラー ${response.status}: ${apiSummary}`,
        );
      }

      lastTransientError = { status: response.status, summary: apiSummary };

      if (attempt < maxRetriesPerModel) {
        await wait(resolveRetryDelayMs(response.headers.get("retry-after"), retryDelayMs, attempt));
      }
    }
  }

  throw new GeminiMessageGenerationError(
    lastTransientError?.summary ?? "Gemini API request failed.",
    lastTransientError ?
      `Gemini APIエラー ${lastTransientError.status}: ${lastTransientError.summary}` :
      "Gemini API request failed.",
  );
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

export function buildRecentGreetingOpeningExamples(
  runs: Array<{ messageText: string; sentAt: string }>,
  today = new Date(),
) {
  const cutoffTime = today.getTime() - RECENT_OPENING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const examples: string[] = [];

  for (const run of runs) {
    const sentAt = Date.parse(run.sentAt);

    if (Number.isNaN(sentAt) || sentAt < cutoffTime || sentAt > today.getTime()) {
      continue;
    }

    const opening = extractGreetingOpeningExpression(run.messageText);

    if (!opening || seen.has(opening)) {
      continue;
    }

    seen.add(opening);
    examples.push(opening);

    if (examples.length >= RECENT_OPENING_MAX_EXAMPLES) {
      break;
    }
  }

  return examples;
}

export function buildRecentGreetingOpeningKeywords(openings: string[]) {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const opening of openings) {
    for (const keyword of extractOpeningKeywords(opening)) {
      if (seen.has(keyword)) {
        continue;
      }

      seen.add(keyword);
      keywords.push(keyword);

      if (keywords.length >= RECENT_OPENING_BANNED_KEYWORD_MAX_EXAMPLES) {
        return keywords;
      }
    }
  }

  return keywords;
}

function extractGreetingOpeningExpression(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const greetingPattern = new RegExp(`^(${TIME_OF_DAY_GREETINGS.map(escapeRegExp).join("|")})\\s*`);
  const withoutGreeting = normalizedText.replace(greetingPattern, "").trim();

  if (withoutGreeting.length < 8) {
    return "";
  }

  const sentenceMatch = withoutGreeting.match(/^(.{1,100}?[。.!?！？])/u);

  return (sentenceMatch?.[1] ?? withoutGreeting.slice(0, 80)).trim();
}

function findRecentGreetingConflict(text: string, recentOpeningExamples: string[], recentOpeningKeywords: string[]) {
  const opening = extractGreetingOpeningExpression(text);

  if (!opening) {
    return null;
  }

  const similarOpening = recentOpeningExamples.find((example) => areGreetingOpeningsSimilar(opening, example));
  const repeatedKeywords = findRepeatedOpeningKeywords(opening, recentOpeningKeywords);

  if (!similarOpening && repeatedKeywords.length === 0) {
    return null;
  }

  return { opening: similarOpening ?? "", repeatedKeywords };
}

function areGreetingOpeningsSimilar(left: string, right: string) {
  const normalizedLeft = normalizeGreetingOpeningForComparison(left);
  const normalizedRight = normalizeGreetingOpeningForComparison(right);

  if (normalizedLeft.length < 8 || normalizedRight.length < 8) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  return calculateBigramDiceSimilarity(normalizedLeft, normalizedRight) >= RECENT_OPENING_SIMILARITY_THRESHOLD;
}

function normalizeGreetingOpeningForComparison(value: string) {
  const opening = extractGreetingOpeningExpression(value) || value;

  return opening
    .replace(/^(今日は|本日は)?\s*\d{1,2}月\d{1,2}日[、,\s]*/u, "")
    .replace(/^(今日は|本日は)[、,\s]*/u, "")
    .replace(/[「」『』"“”'’\s。、,.，!！?？]/gu, "")
    .trim();
}

function extractOpeningKeywords(text: string) {
  const opening = extractGreetingOpeningExpression(text) || text;
  const seasonalClause = normalizeOpeningSeasonalClause(opening);
  const seen = new Set<string>();
  const keywords: string[] = [];
  const nounCandidates = seasonalClause.match(/[一-龯々〆ヵヶ]{2,8}(?:[ぁ-ん]{1,3})?|[ァ-ヴー]{3,12}/gu) ?? [];

  for (const candidate of nounCandidates) {
    addOpeningKeyword(candidate, seen, keywords);
  }

  return keywords;
}

function normalizeOpeningSeasonalClause(opening: string) {
  return opening
    .replace(/^(今日は|本日は)?\s*\d{1,2}月\d{1,2}日[、,\s]*/u, "")
    .replace(/^(今日は|本日は)[、,\s]*/u, "")
    .replace(/名古屋.*$/u, "")
    .replace(/[「」『』"“”'’]/gu, "")
    .trim();
}

function addOpeningKeyword(keyword: string, seen: Set<string>, keywords: string[]) {
  const normalizedKeyword = normalizeOpeningKeyword(keyword);

  if (
    normalizedKeyword.length < 2 ||
    OPENING_KEYWORD_STOP_WORDS.has(normalizedKeyword) ||
    seen.has(normalizedKeyword)
  ) {
    return;
  }

  seen.add(normalizedKeyword);
  keywords.push(normalizedKeyword);
}

function normalizeOpeningKeyword(keyword: string) {
  return keyword
    .trim()
    .replace(/(です|ですね|ます|ました|でしょう|頃|ごろ)$/u, "")
    .replace(/[はがをにへとでのもや、。,.，!！?？]+$/u, "")
    .trim();
}

function findRepeatedOpeningKeywords(opening: string, recentOpeningKeywords: string[]) {
  const seasonalClause = normalizeOpeningSeasonalClause(opening);

  return recentOpeningKeywords.filter((keyword) => seasonalClause.includes(keyword));
}

function calculateBigramDiceSimilarity(left: string, right: string) {
  const leftBigrams = toBigramCounts(left);
  const rightBigrams = toBigramCounts(right);
  let overlap = 0;
  let leftTotal = 0;
  let rightTotal = 0;

  for (const count of leftBigrams.values()) {
    leftTotal += count;
  }

  for (const [bigram, rightCount] of rightBigrams) {
    const leftCount = leftBigrams.get(bigram) ?? 0;

    rightTotal += rightCount;
    overlap += Math.min(leftCount, rightCount);
  }

  if (leftTotal === 0 || rightTotal === 0) {
    return 0;
  }

  return (2 * overlap) / (leftTotal + rightTotal);
}

function toBigramCounts(value: string) {
  const counts = new Map<string, number>();

  for (let index = 0; index < value.length - 1; index += 1) {
    const bigram = value.slice(index, index + 2);

    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return counts;
}

function buildDailyGreetingPrompt({
  birthFlower,
  calendarEventInfo,
  dateInfo,
  location,
  recentOpeningKeywords,
  timeOfDayGreeting,
  weatherInfo,
}: {
  birthFlower: BirthFlower | null;
  calendarEventInfo?: string;
  dateInfo: string;
  location: string;
  recentOpeningKeywords: string[];
  timeOfDayGreeting: string;
  weatherInfo: string;
}) {
  const normalizedCalendarEventInfo = calendarEventInfo?.trim();
  const calendarEventInfoLine = normalizedCalendarEventInfo
    ? `・今日の大切な予定: ${normalizedCalendarEventInfo}\n`
    : "";
  const birthFlowerInfoLine = birthFlower
    ? `・今日の誕生花: ${birthFlower.flower}\n・誕生花の花言葉: ${birthFlower.language}\n`
    : "";
  const characterCountRule = normalizedCalendarEventInfo ? "80文字〜130文字" : "60文字〜95文字";
  const recentOpeningKeywordsText = recentOpeningKeywords.map((keyword) => `・${keyword}`).join("\n");
  const recentOpeningKeywordsSection = recentOpeningKeywordsText
    ? `\n【最近使った禁止キーワード】\n${recentOpeningKeywordsText}\n`
    : "";

  return `
あなたは、${location}にお住まいの高齢者の方に毎日寄り添う、親切で優しいケアマネージャーです。
以下の【今日の情報】を自然に盛り込んで、LINEで送る短い挨拶文を1つだけ作成してください。

【今日の情報】
・日付: ${dateInfo}
${calendarEventInfoLine}${birthFlowerInfoLine}・天気予報: ${weatherInfo}
${recentOpeningKeywordsSection}

【お年寄り向けの絶対ルール】
1. 本文の冒頭は必ず「${timeOfDayGreeting}」にしてください。
2. 冒頭の挨拶の直後に、必ず「今日は${dateInfo}、」を入れてください。
3. 「今日は${dateInfo}、」に続けて、指定された日付の時期に合う季節の言葉を1つだけ、わかりやすく含めてください。
4. 上の【最近使った禁止キーワード】に列挙された語は、冒頭の季節の一言には使わないでください。ただし、誕生花の定型文や天気予報の説明に必要な場合は使ってかまいません。
5. 今日の大切な予定がある場合は、誕生花、花言葉、天気、季節の話題よりも優先して本文の中心にしてください。
6. 今日の大切な予定は、自然な日本語に整えてください。人名と思われる名前には「さん」を付けてください。
   例: 「千夏子の誕生日」→「今日は千夏子さんのお誕生日ですね。」
   例: 「岳夫と由美子の結婚記念日」→「今日は岳夫さんと由美子さんの結婚記念日ですね。」
7. 【今日の情報】の「今日の誕生花」と「誕生花の花言葉」を必ずそのまま使い、別の花や別の花言葉に置き換えないでください。
8. 誕生花は必ず「今日の誕生花は○○○、花言葉は△△△△△です。」という形で本文に入れてください。
9. お年寄りが「ああ、もうそんな季節か」と感じられる、雑学的でやさしい表現にしてください。
10. 文字数は「${characterCountRule}」の範囲内に収めてください。
11. 漢字を多くせず、ひらがなを多めにして、専門用語は使わないでください。
12. 天気予報や注意情報に基づき、具体的な行動アドバイスを必ず最後に入れてください。
13. 解説や前置きは不要です。LINEの本文のみを出力してください。
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

  return `${timeOfDayGreeting}\n${ensureDateInGreetingText(textWithoutExistingGreeting, sendTime)}`;
}

function ensureDateInGreetingText(text: string, sendTime: Date) {
  const dateInfo = formatMonthDayInJapan(sendTime);

  if (text.includes(dateInfo)) {
    return text;
  }

  const todayPrefixMatch = text.match(/^(今日は|本日は)\s*[、,\s]*/u);

  if (todayPrefixMatch) {
    return `今日は${dateInfo}、${text.slice(todayPrefixMatch[0].length).trimStart()}`;
  }

  return `今日は${dateInfo}、${text}`;
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

function getGeminiModelCandidates() {
  const primaryModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const configuredFallbackModels = parseCommaSeparatedEnv(process.env.GEMINI_FALLBACK_MODELS);
  const fallbackModels = configuredFallbackModels.length ? configuredFallbackModels : DEFAULT_GEMINI_FALLBACK_MODELS;

  return [...new Set([primaryModel, ...fallbackModels])];
}

function getGeminiMaxRetriesPerModel() {
  return normalizeNonNegativeInteger(process.env.GEMINI_MAX_RETRIES_PER_MODEL, DEFAULT_GEMINI_MAX_RETRIES_PER_MODEL);
}

function getGeminiRetryDelayMs() {
  return normalizeNonNegativeInteger(process.env.GEMINI_RETRY_DELAY_MS, DEFAULT_GEMINI_RETRY_DELAY_MS);
}

function normalizeNonNegativeInteger(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function parseCommaSeparatedEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveRetryDelayMs(retryAfter: null | string, retryDelayMs: number, attempt: number) {
  const trimmedRetryAfter = retryAfter?.trim();

  if (trimmedRetryAfter) {
    const retryAfterSeconds = Number(trimmedRetryAfter);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }

    const retryAfterDate = Date.parse(trimmedRetryAfter);

    if (!Number.isNaN(retryAfterDate)) {
      return Math.max(0, retryAfterDate - Date.now());
    }
  }

  return retryDelayMs * 2 ** attempt;
}

function wait(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
