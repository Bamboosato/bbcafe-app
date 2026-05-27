import { jsonData } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import { readCookie, verifyViewerSessionCookie, VIEWER_SESSION_COOKIE } from "@/lib/server/session";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const payload = verifyViewerSessionCookie(readCookie(request, VIEWER_SESSION_COOKIE));

  return jsonData(
    {
      authenticated: Boolean(payload),
      lineAccountId: payload?.lineAccountId ?? null,
      viewerSharedId: payload?.viewerSharedId ?? null,
    },
    requestId,
  );
}
