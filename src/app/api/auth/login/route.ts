import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/api-response";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  ADMIN_SESSION_COOKIE,
  clearSessionCookieOptions,
  createAdminSessionCookieValue,
  createViewerSessionCookieValue,
  sessionCookieOptions,
  VIEWER_SESSION_COOKIE,
} from "@/lib/server/session";
import { writeAuditLogBestEffort } from "@/features/messages/server/auditLog";
import { DEFAULT_LINE_ACCOUNT_ID, getLineAccount } from "@/features/messages/server/lineAccounts";
import {
  isConfiguredAdminLoginId,
  verifyConfiguredAdminPassword,
  verifyViewerCredentials,
} from "@/features/messages/server/login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const lineAccountId = DEFAULT_LINE_ACCOUNT_ID;

  try {
    const body = await readJsonBody(request);
    const id = pickString(body, "id");
    const password = pickString(body, "password");

    if (isConfiguredAdminLoginId(id)) {
      const adminPassword = await verifyConfiguredAdminPassword(password);

      if (!adminPassword.configured) {
        return jsonError(503, "SERVICE_UNAVAILABLE", "管理者認証の設定が不足しています。", requestId);
      }

      if (!adminPassword.valid) {
        await writeAuditLogBestEffort({
          actor: "admin",
          message: "Admin login failed",
          requestId,
          result: "failure",
          type: "admin_login_failure",
        });

        return jsonError(401, "UNAUTHORIZED", "IDまたはパスワードが正しくありません。", requestId);
      }

      const account = await getLineAccount(lineAccountId);

      await writeAuditLogBestEffort({
        actor: "admin",
        message: "Admin login succeeded",
        requestId,
        result: "success",
        type: "admin_login_success",
      });

      const response = NextResponse.json({
        data: {
          authenticated: true,
          role: "admin",
          viewerSharedId: account.viewerSharedId,
        },
        meta: {
          requestId,
        },
      });

      response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionCookieValue(), sessionCookieOptions());
      response.cookies.set(
        VIEWER_SESSION_COOKIE,
        createViewerSessionCookieValue(lineAccountId, Date.now(), account.viewerSharedId),
        sessionCookieOptions(),
      );

      return response;
    }

    const viewerAuth = await verifyViewerCredentials({ lineAccountId, password, sharedId: id });

    if (!viewerAuth.configured) {
      return jsonError(503, "SERVICE_UNAVAILABLE", "閲覧者認証の設定が不足しています。", requestId);
    }

    if (!viewerAuth.valid) {
      await writeAuditLogBestEffort({
        actor: "viewer",
        lineAccountId,
        message: "Viewer login failed",
        requestId,
        result: "failure",
        type: "viewer_login_failure",
      });

      return jsonError(401, "UNAUTHORIZED", "IDまたはパスワードが正しくありません。", requestId);
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
        role: "viewer",
        viewerSharedId: viewerAuth.account.viewerSharedId,
      },
      meta: {
        requestId,
      },
    });

    response.cookies.set(
      VIEWER_SESSION_COOKIE,
      createViewerSessionCookieValue(lineAccountId, Date.now(), viewerAuth.account.viewerSharedId),
      sessionCookieOptions(),
    );
    response.cookies.set(ADMIN_SESSION_COOKIE, "", clearSessionCookieOptions());

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[auth-login] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "認証を利用できません。", requestId);
  }
}

function pickString(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return "";
  }

  const raw = (value as Record<string, unknown>)[key];

  return typeof raw === "string" ? raw : "";
}
