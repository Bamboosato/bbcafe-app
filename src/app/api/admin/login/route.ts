import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/api-response";
import { normalizeLoginId, safeStringEqual, verifyPasswordHash } from "@/lib/server/crypto";
import { createRequestId, readJsonBody } from "@/lib/server/request";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionCookieValue,
  sessionCookieOptions,
} from "@/lib/server/session";
import { writeAuditLogBestEffort } from "@/features/messages/server/auditLog";

export const runtime = "nodejs";

const DEFAULT_ADMIN_LOGIN_ID = "admin";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const body = await readJsonBody(request);
    const adminId =
      typeof body === "object" && body !== null && "adminId" in body
        ? String((body as { adminId?: unknown }).adminId ?? "")
        : "";
    const password =
      typeof body === "object" && body !== null && "password" in body
        ? String((body as { password?: unknown }).password ?? "")
        : "";
    const expectedAdminId = process.env.ADMIN_LOGIN_ID?.trim() || DEFAULT_ADMIN_LOGIN_ID;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();

    if (!passwordHash) {
      return jsonError(503, "SERVICE_UNAVAILABLE", "管理者認証の設定が不足しています。", requestId);
    }

    const adminIdValid = safeStringEqual(normalizeLoginId(adminId), normalizeLoginId(expectedAdminId));
    const passwordValid = await verifyPasswordHash(password, passwordHash);

    if (!adminIdValid || !passwordValid) {
      await writeAuditLogBestEffort({
        actor: "admin",
        message: "Admin login failed",
        requestId,
        result: "failure",
        type: "admin_login_failure",
      });

      return jsonError(401, "UNAUTHORIZED", "管理者IDまたはパスワードが正しくありません。", requestId);
    }

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
      },
      meta: {
        requestId,
      },
    });

    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      createAdminSessionCookieValue(),
      sessionCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    console.error("[admin-login] failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "管理者認証を利用できません。", requestId);
  }
}
