import {
  generateDailyGreetingMessage,
  getDailyGreetingGenerationPartialResult,
  summarizeDailyGreetingGenerationError,
} from "@/features/messages/server/gemini";
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

    const partialResult = getDailyGreetingGenerationPartialResult(error);

    if (partialResult) {
      return jsonData(
        {
          location: partialResult.location,
          message: partialResult.text,
          warning: `不完全なメッセージの可能性があります。内容を確認し、必要に応じて編集してください。（エラー番号: ${requestId} / 概要: ${summary}）`,
        },
        requestId,
      );
    }

    return jsonError(
      503,
      "SERVICE_UNAVAILABLE",
      `メッセージを作成できません。（エラー番号: ${requestId} / 概要: ${summary}）`,
      requestId,
    );
  }
}
