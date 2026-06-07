import { generateDailyGreetingMessage, summarizeDailyGreetingGenerationError } from "@/features/messages/server/gemini";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { location, text } = await generateDailyGreetingMessage();

    return jsonData({ location, message: text }, requestId);
  } catch (error) {
    const summary = summarizeDailyGreetingGenerationError(error);

    console.error("[message-assistant-generate] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
      summary,
    });

    return jsonError(
      503,
      "SERVICE_UNAVAILABLE",
      `メッセージを作成できません。（エラー番号: ${requestId} / 概要: ${summary}）`,
      requestId,
    );
  }
}
