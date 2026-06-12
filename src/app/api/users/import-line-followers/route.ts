import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId } from "@/lib/server/request";
import { getLineCredentials } from "@/features/messages/server/credentials";
import { importLineFollowers } from "@/features/messages/server/line";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const credentials = await getLineCredentials(auth.payload.lineAccountId);
    const result = await importLineFollowers({
      channelAccessToken: credentials.channelAccessToken,
      lineAccountId: auth.payload.lineAccountId,
    });

    return jsonData(result, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "LINE_FOLLOWERS_IDS_403") {
      return jsonError(
        403,
        "FORBIDDEN",
        "LINEの友だち一覧取得APIは認証済みアカウントまたはプレミアムアカウントで利用できます。",
        requestId,
      );
    }

    console.error("[users-import-line-followers] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "LINEの友だち一覧を取り込めません。", requestId);
  }
}
