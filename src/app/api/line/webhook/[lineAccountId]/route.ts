import { jsonData, jsonError } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import { getLineCredentials } from "@/features/messages/server/credentials";
import { processLineWebhookEvents, verifyLineSignature } from "@/features/messages/server/line";
import { writeAuditLogBestEffort } from "@/features/messages/server/auditLog";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    lineAccountId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const { lineAccountId } = await context.params;

  try {
    const credentials = await getLineCredentials(lineAccountId);
    const rawBody = await request.text();
    const validSignature = verifyLineSignature(
      rawBody,
      request.headers.get("x-line-signature"),
      credentials.channelSecret,
    );

    if (!validSignature) {
      await writeAuditLogBestEffort({
        actor: "line",
        lineAccountId,
        message: "LINE webhook signature verification failed",
        requestId,
        result: "failure",
        type: "line_webhook_signature_failed",
      });

      return jsonError(401, "UNAUTHORIZED", "署名検証に失敗しました。", requestId);
    }

    const payload = JSON.parse(rawBody) as unknown;
    const result = await processLineWebhookEvents({
      channelAccessToken: credentials.channelAccessToken,
      lineAccountId,
      payload: typeof payload === "object" && payload !== null ? payload : {},
    });

    return jsonData(result, requestId);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[line-webhook] failed", {
      lineAccountId,
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "Webhookを処理できません。", requestId);
  }
}
