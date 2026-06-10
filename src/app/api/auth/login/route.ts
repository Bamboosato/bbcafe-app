import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/api-response";
import { getAdminAuth } from "@/lib/server/firebase";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  ACCOUNT_SESSION_COOKIE,
  clearAppSessionCookies,
  createAccountSessionCookieValue,
  sessionCookieOptions,
} from "@/lib/server/session";
import { getOrProvisionAuthUser } from "@/features/messages/server/authUsers";
import { getLineAccount } from "@/features/messages/server/lineAccounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const body = await readJsonBody(request);
    const idToken = pickString(body, "idToken");

    if (!idToken) {
      return jsonError(400, "VALIDATION_ERROR", "認証トークンが不足しています。", requestId);
    }

    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const authUser = await getOrProvisionAuthUser(decodedToken);

    if (authUser.status !== "active" || !authUser.lineAccountId) {
      return jsonError(403, "FORBIDDEN", "このアカウントは利用できません。", requestId);
    }

    const account = await getLineAccount(authUser.lineAccountId);
    const response = NextResponse.json({
      data: {
        authenticated: true,
        displayName: account.displayName,
        email: authUser.email,
        lineAccountId: authUser.lineAccountId,
      },
      meta: {
        requestId,
      },
    });

    clearAppSessionCookies(response);
    response.cookies.set(
      ACCOUNT_SESSION_COOKIE,
      createAccountSessionCookieValue({
        email: authUser.email,
        lineAccountId: authUser.lineAccountId,
        uid: authUser.uid,
      }),
      sessionCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[auth-login] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(401, "UNAUTHORIZED", "メールアドレスまたはパスワードが正しくありません。", requestId);
  }
}

function pickString(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return "";
  }

  const raw = (value as Record<string, unknown>)[key];

  return typeof raw === "string" ? raw : "";
}
