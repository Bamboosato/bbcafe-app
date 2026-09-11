import { afterEach, describe, expect, it, vi } from "vitest";
import { hasChannelIdChanged, isCredentialConfigured, toCommonSettingsView } from "./route";

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

describe("common settings external care signal state", () => {
  it("exposes the persisted daily care setting to the management screen", () => {
    expect(
      toCommonSettingsView(
        {
          accessTokenValidatedAt: null,
          channelAccessTokenRef: "LINE_CHANNEL_ACCESS_TOKEN",
          channelId: "channel-id",
          channelSecretRef: "LINE_CHANNEL_SECRET",
          credentialProvider: "env",
          displayName: "BB Cafe",
          lineAccountId: "account-a",
          retentionDays: 90,
          webhookVerifiedAt: null,
        },
        { externalCareSignalsEnabled: true, historyRetentionDays: 180 },
      ),
    ).toMatchObject({
      externalCareSignalsEnabled: true,
      sentRetentionDays: 180,
    });
  });
});
