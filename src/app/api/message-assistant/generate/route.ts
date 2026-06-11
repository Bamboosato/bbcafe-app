import {
  buildRecentGreetingOpeningExamples,
  generateDailyGreetingMessage,
  getDailyGreetingGenerationPartialResult,
  summarizeDailyGreetingGenerationError,
} from "@/features/messages/server/gemini";
import {
  buildCalendarEventsSummary,
  listTodayCalendarEvents,
} from "@/features/messages/server/calendarEvents";
import { listSendRuns } from "@/features/messages/server/broadcasts";
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
    const today = new Date();
    const todayCalendarEvents = await listTodayCalendarEvents(auth.payload.lineAccountId, today);
    const todayCalendarEventText = buildCalendarEventsSummary(todayCalendarEvents);
    const recentSendRuns = await listSendRuns(auth.payload.lineAccountId, 20);
    const { location, text } = await generateDailyGreetingMessage({
      calendarEventInfo: todayCalendarEventText,
      recentOpeningExamples: buildRecentGreetingOpeningExamples(recentSendRuns, today),
      today,
    });

    return jsonData({ location, message: text, todayCalendarEventText }, requestId);
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
