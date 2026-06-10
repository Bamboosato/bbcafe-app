import { afterEach, describe, expect, it, vi } from "vitest";
import { hasChannelIdChanged, isCredentialConfigured } from "./route";

describe("common settings credential display state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats validated encrypted Firestore credentials as configured", () => {
    expect(isCredentialConfigured("encryptedFirestore", "2026-06-10T04:00:00.000Z", "")).toBe(true);
  });

  it("does not treat unvalidated encrypted Firestore credentials as configured", () => {
    expect(isCredentialConfigured("encryptedFirestore", null, "")).toBe(false);
  });

  it("treats non-empty environment credentials as configured", () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "token");

    expect(isCredentialConfigured("env", null, "LINE_CHANNEL_ACCESS_TOKEN")).toBe(true);
  });

  it("does not treat blank environment credentials as configured", () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", " ");

    expect(isCredentialConfigured("env", null, "LINE_CHANNEL_ACCESS_TOKEN")).toBe(false);
  });
});

describe("common settings channel ID change detection", () => {
  it("ignores surrounding whitespace when comparing channel IDs", () => {
    expect(hasChannelIdChanged("2010193672", " 2010193672 ")).toBe(false);
  });

  it("detects a different channel ID", () => {
    expect(hasChannelIdChanged("2010193672", "2000000000")).toBe(true);
  });
});
