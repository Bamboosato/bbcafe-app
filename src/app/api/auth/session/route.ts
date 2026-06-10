import { NextResponse } from "next/server";
import { createRequestId } from "@/lib/server/request";
import {
  ACCOUNT_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  clearSessionCookieOptions,
  readCookie,
  verifyAccountSessionCookie,
  VIEWER_SESSION_COOKIE,
} from "@/lib/server/session";
import { getLineAccount } from "@/features/messages/server/lineAccounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const payload = verifyAccountSessionCookie(readCookie(request, ACCOUNT_SESSION_COOKIE));
  const account = payload ? await getLineAccount(payload.lineAccountId).catch(() => null) : null;
  const response = NextResponse.json({
    data: {
      authenticated: Boolean(payload),
      displayName: account?.displayName ?? null,
      email: payload?.email ?? null,
      lineAccountId: payload?.lineAccountId ?? null,
    },
    meta: {
      requestId,
    },
  });

  response.cookies.set(ADMIN_SESSION_COOKIE, "", clearSessionCookieOptions());
  response.cookies.set(VIEWER_SESSION_COOKIE, "", clearSessionCookieOptions());

  return response;
}
