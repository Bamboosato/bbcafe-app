import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/api-response";
import { normalizeLoginId, safeStringEqual, verifyPasswordHash } from "@/lib/server/crypto";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  createViewerSessionCookieValue,
  sessionCookieOptions,
  VIEWER_SESSION_COOKIE,
} from "@/lib/server/session";
import { writeAuditLogBestEffort } from "@/features/messages/server/auditLog";
import { DEFAULT_LINE_ACCOUNT_ID, getLineAccount } from "@/features/messages/server/lineAccounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const lineAccountId = DEFAULT_LINE_ACCOUNT_ID;

  try {
    const body = await readJsonBody(request);
    const sharedId =
      typeof body === "object" && body !== null && "sharedId" in body
        ? String((body as { sharedId?: unknown }).sharedId ?? "")
        : "";
    const password =
      typeof body === "object" && body !== null && "password" in body
        ? String((body as { password?: unknown }).password ?? "")
        : "";
    const account = await getLineAccount(lineAccountId);

    if (!account.viewerPasswordHash) {
      return jsonError(503, "SERVICE_UNAVAILABLE", "閲覧者認証の設定が不足しています。", requestId);
    }

    const sharedIdValid = safeStringEqual(
      normalizeLoginId(sharedId),
      normalizeLoginId(account.viewerSharedId),
    );
    const passwordValid = await verifyPasswordHash(password, account.viewerPasswordHash);

    if (!sharedIdValid || !passwordValid) {
      await writeAuditLogBestEffort({
        actor: "viewer",
        lineAccountId,
        message: "Viewer login failed",
        requestId,
        result: "failure",
        type: "viewer_login_failure",
      });

      return jsonError(401, "UNAUTHORIZED", "共有IDまたはパスワードが正しくありません。", requestId);
    }

    await writeAuditLogBestEffort({
      actor: "viewer",
      lineAccountId,
      message: "Viewer login succeeded",
      requestId,
      result: "success",
      type: "viewer_login_success",
    });

    const response = NextResponse.json({
      data: {
        authenticated: true,
        viewerSharedId: account.viewerSharedId,
      },
      meta: {
        requestId,
      },
    });

    response.cookies.set(
      VIEWER_SESSION_COOKIE,
      createViewerSessionCookieValue(lineAccountId, Date.now(), account.viewerSharedId),
      sessionCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[viewer-login] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "閲覧者認証を利用できません。", requestId);
  }
}
