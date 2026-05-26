import { describe, expect, it } from "vitest";
import { createPasswordHash, safeStringEqual, verifyPasswordHash } from "./crypto";
import {
  createViewerSessionCookieValue,
  verifyAdminSessionCookie,
  verifyViewerSessionCookie,
} from "./session";

describe("server crypto helpers", () => {
  it("verifies PBKDF2 password hashes", async () => {
    const hash = createPasswordHash("secret-password", 1000);

    await expect(verifyPasswordHash("secret-password", hash)).resolves.toBe(true);
    await expect(verifyPasswordHash("wrong-password", hash)).resolves.toBe(false);
  });

  it("handles timing-safe string equality", () => {
    expect(safeStringEqual("abc", "abc")).toBe(true);
    expect(safeStringEqual("abc", "abcd")).toBe(false);
    expect(safeStringEqual("abc", "abd")).toBe(false);
  });

  it("verifies viewer session cookies by role", () => {
    process.env.SESSION_SECRET = "test-secret";

    const cookie = createViewerSessionCookieValue("default", 0);

    expect(verifyViewerSessionCookie(cookie, 1000)?.lineAccountId).toBe("default");
    expect(verifyAdminSessionCookie(cookie, 1000)).toBeNull();
  });
});
