import { generateDailyGreetingMessage } from "@/features/messages/server/gemini";
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
    console.error("[message-assistant-generate] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "メッセージを作成できません。", requestId);
  }
}
