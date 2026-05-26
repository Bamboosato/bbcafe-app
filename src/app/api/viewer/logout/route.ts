import { NextResponse } from "next/server";
import { createRequestId } from "@/lib/server/request";
import { clearSessionCookieOptions, VIEWER_SESSION_COOKIE } from "@/lib/server/session";

export async function POST() {
  const requestId = createRequestId();
  const response = NextResponse.json({
    data: {
      authenticated: false,
    },
    meta: {
      requestId,
    },
  });

  response.cookies.set(VIEWER_SESSION_COOKIE, "", clearSessionCookieOptions());

  return response;
}
