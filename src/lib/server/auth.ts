import { jsonError } from "./api-response";
import {
  ACCOUNT_SESSION_COOKIE,
  readCookie,
  verifyAccountSessionCookie,
} from "./session";

export function requireAdminSession(request: Request, requestId: string) {
  const payload = verifyAccountSessionCookie(readCookie(request, ACCOUNT_SESSION_COOKIE));

  if (!payload) {
    return {
      response: jsonError(401, "UNAUTHORIZED", "ログインが必要です。", requestId),
    };
  }

  return {
    payload,
  };
}

export function requireViewerSession(request: Request, requestId: string) {
  const payload = verifyAccountSessionCookie(readCookie(request, ACCOUNT_SESSION_COOKIE));

  if (!payload) {
    return {
      response: jsonError(401, "UNAUTHORIZED", "ログインが必要です。", requestId),
    };
  }

  return {
    payload,
  };
}
