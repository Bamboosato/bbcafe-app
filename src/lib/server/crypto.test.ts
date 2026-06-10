import { describe, expect, it } from "vitest";
import { createPasswordHash, decryptSecret, encryptSecret, safeStringEqual, verifyPasswordHash } from "./crypto";
import {
  createAccountSessionCookieValue,
  verifyAccountSessionCookie,
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

  it("verifies account session cookies", () => {
    process.env.SESSION_SECRET = "test-secret";

    const cookie = createAccountSessionCookieValue({
      email: "takes.ngo.jp@gmail.com",
      lineAccountId: "default",
      now: 0,
      uid: "test-uid",
    });
    const payload = verifyAccountSessionCookie(cookie, 1000);

    expect(payload?.email).toBe("takes.ngo.jp@gmail.com");
    expect(payload?.lineAccountId).toBe("default");
    expect(payload?.uid).toBe("test-uid");
  });

  it("encrypts and decrypts stored secrets", () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

    const encrypted = encryptSecret("line-secret");

    expect(encrypted).not.toBe("line-secret");
    expect(decryptSecret(encrypted)).toBe("line-secret");
  });
});
