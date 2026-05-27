import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "bbcafe_admin";
export const VIEWER_SESSION_COOKIE = "bbcafe_viewer";

const SESSION_TTL_SECONDS = 60 * 60 * 24;

export type AdminSessionPayload = {
  exp: number;
  role: "admin";
};

export type ViewerSessionPayload = {
  exp: number;
  lineAccountId: string;
  role: "viewer";
  viewerSharedId?: string;
};

type SessionPayload = AdminSessionPayload | ViewerSessionPayload;

function requiredSessionSecret() {
  const value = process.env.SESSION_SECRET?.trim();

  if (!value) {
    throw new Error("Missing required environment variable: SESSION_SECRET");
  }

  return value;
}

function optionalSessionSecret() {
  return process.env.SESSION_SECRET?.trim() || null;
}

export function createAdminSessionCookieValue(now = Date.now()) {
  return createSessionCookieValue(
    {
      exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
      role: "admin",
    },
    requiredSessionSecret(),
  );
}

export function createViewerSessionCookieValue(lineAccountId: string, now = Date.now(), viewerSharedId?: string) {
  return createSessionCookieValue(
    {
      exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
      lineAccountId,
      role: "viewer",
      ...(viewerSharedId?.trim() ? { viewerSharedId: viewerSharedId.trim() } : {}),
    },
    requiredSessionSecret(),
  );
}

export function verifyAdminSessionCookie(value: string | undefined | null, now = Date.now()) {
  const payload = verifySessionCookie(value, now);

  return payload?.role === "admin" ? payload : null;
}

export function verifyViewerSessionCookie(value: string | undefined | null, now = Date.now()) {
  const payload = verifySessionCookie(value, now);

  return payload?.role === "viewer" ? payload : null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");

    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

function createSessionCookieValue(payload: SessionPayload, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(body, secret);

  return `${body}.${signature}`;
}

function verifySessionCookie(value: string | undefined | null, now: number) {
  if (!value) {
    return null;
  }

  const [body, signature] = value.split(".");
  const secret = optionalSessionSecret();

  if (!body || !signature || !secret) {
    return null;
  }

  if (!safeSignatureEqual(signPayload(body, secret), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;

    if (payload.exp <= Math.floor(now / 1000)) {
      return null;
    }

    if (payload.role === "admin") {
      return payload;
    }

    if (payload.role === "viewer" && payload.lineAccountId) {
      return payload;
    }

    return null;
  } catch {
    return null;
  }
}

function signPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeSignatureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
