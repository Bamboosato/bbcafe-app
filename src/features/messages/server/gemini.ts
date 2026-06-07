const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_MESSAGE_LOCATION = "日本";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type GeminiErrorResponse = {
  error?: {
    message?: string;
  };
};

export async function generateDailyGreetingMessage({
  location = process.env.MESSAGE_LOCATION?.trim() || DEFAULT_MESSAGE_LOCATION,
  today = new Date(),
}: {
  location?: string;
  today?: Date;
} = {}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const prompt = buildDailyGreetingPrompt({ location, today });
  const response = await fetch(
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
          maxOutputTokens: 240,
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
    throw new Error(payload.error?.message || "Gemini API request failed.");
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini API did not return message text.");
  }

  return {
    location,
    text,
  };
}

function buildDailyGreetingPrompt({ location, today }: { location: string; today: Date }) {
  const todayStr = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeZone: "Asia/Tokyo",
  }).format(today);

  return `
本日の日付（${todayStr}）と、対象地域「${location}」の「現在の時期の典型的な天気や気候」、
および今の時期の暦（二十四節気など）をあなたの知識から考慮してください。

その情報をもとに、高齢者の方に向けた「今日の一言メッセージ（挨拶文）」を1つ作成してください。

【条件】
・「今日の季節感や暦」の話題から会話を始める
・専門用語は使わず、語りかけるような優しい口調にする
・体調を気遣う一言で締めくくる
・スマホLINEで読みやすいよう、適度に改行を入れる
・本文のみを出力する
`.trim();
}
