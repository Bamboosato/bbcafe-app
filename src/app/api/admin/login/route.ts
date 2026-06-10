import { NextResponse } from "next/server";
import { createRequestId } from "@/lib/server/request";
import { clearAppSessionCookies } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST() {
  const requestId = createRequestId();
  const response = NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "このログイン方式は廃止されました。",
      },
      meta: {
        requestId,
      },
    },
    { status: 401 },
  );

  clearAppSessionCookies(response);

  return response;
}
