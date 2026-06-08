import { jsonData } from "@/lib/server/api-response";
import { createRequestId } from "@/lib/server/request";
import {
  ADMIN_SESSION_COOKIE,
  readCookie,
  verifyAdminSessionCookie,
  verifyViewerSessionCookie,
  VIEWER_SESSION_COOKIE,
} from "@/lib/server/session";
import { DEFAULT_LINE_ACCOUNT_ID, getLineAccount } from "@/features/messages/server/lineAccounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const adminPayload = verifyAdminSessionCookie(readCookie(request, ADMIN_SESSION_COOKIE));
  const viewerPayload = verifyViewerSessionCookie(readCookie(request, VIEWER_SESSION_COOKIE));

  if (adminPayload) {
    const account = viewerPayload?.viewerSharedId ? null : await getLineAccount(DEFAULT_LINE_ACCOUNT_ID);

    return jsonData(
      {
        authenticated: true,
        lineAccountId: viewerPayload?.lineAccountId ?? DEFAULT_LINE_ACCOUNT_ID,
        role: "admin",
        viewerSharedId: viewerPayload?.viewerSharedId ?? account?.viewerSharedId ?? null,
      },
      requestId,
    );
  }

  return jsonData(
    {
      authenticated: Boolean(viewerPayload),
      lineAccountId: viewerPayload?.lineAccountId ?? null,
      role: viewerPayload ? "viewer" : null,
      viewerSharedId: viewerPayload?.viewerSharedId ?? null,
    },
    requestId,
  );
}
