import { NextResponse } from "next/server";
import { createRequestId } from "@/lib/server/request";
import {
  clearAppSessionCookies,
} from "@/lib/server/session";

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

  clearAppSessionCookies(response);

  return response;
}
