import { jsonData } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import { ADMIN_SESSION_COOKIE, readCookie, verifyAdminSessionCookie } from "@/lib/server/session";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const payload = verifyAdminSessionCookie(readCookie(request, ADMIN_SESSION_COOKIE));

  return jsonData(
    {
      authenticated: Boolean(payload),
    },
    requestId,
  );
}
