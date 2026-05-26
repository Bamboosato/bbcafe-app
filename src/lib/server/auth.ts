import { jsonError } from "./api-response";
import {
  ADMIN_SESSION_COOKIE,
  readCookie,
  verifyAdminSessionCookie,
  verifyViewerSessionCookie,
  VIEWER_SESSION_COOKIE,
} from "./session";

export function requireAdminSession(request: Request, requestId: string) {
  const payload = verifyAdminSessionCookie(readCookie(request, ADMIN_SESSION_COOKIE));

  if (!payload) {
    return {
      response: jsonError(401, "UNAUTHORIZED", "管理者ログインが必要です。", requestId),
    };
  }

  return {
    payload,
  };
}

export function requireViewerSession(request: Request, requestId: string) {
  const payload = verifyViewerSessionCookie(readCookie(request, VIEWER_SESSION_COOKIE));

  if (!payload) {
    return {
      response: jsonError(401, "UNAUTHORIZED", "ログインが必要です。", requestId),
    };
  }

  return {
    payload,
  };
}
