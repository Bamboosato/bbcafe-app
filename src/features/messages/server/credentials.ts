import { FieldValue } from "firebase-admin/firestore";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { getAdminDb } from "@/lib/server/firebase";
import { getLineAccount } from "./lineAccounts";

export type LineCredentials = {
  channelAccessToken: string;
  channelId: string;
  channelSecret: string;
  lineAccountId: string;
};

export async function getLineCredentials(lineAccountId: string): Promise<LineCredentials> {
  const account = await getLineAccount(lineAccountId);

  if (account.credentialProvider === "encryptedFirestore") {
    const snapshot = await getAdminDb()
      .collection("lineAccounts")
      .doc(lineAccountId)
      .collection("credentials")
      .doc("current")
      .get();
    const data = snapshot.data() ?? {};
    const encryptedChannelSecret = typeof data.encryptedChannelSecret === "string" ? data.encryptedChannelSecret : "";
    const encryptedChannelAccessToken =
      typeof data.encryptedChannelAccessToken === "string" ? data.encryptedChannelAccessToken : "";

    if (!account.channelId || !encryptedChannelSecret || !encryptedChannelAccessToken) {
      throw new Error("Missing encrypted LINE channel credentials.");
    }

    return {
      channelAccessToken: decryptSecret(encryptedChannelAccessToken),
      channelId: account.channelId,
      channelSecret: decryptSecret(encryptedChannelSecret),
      lineAccountId: account.lineAccountId,
    };
  }

  const channelSecret = process.env[account.channelSecretRef]?.trim();
  const channelAccessToken = process.env[account.channelAccessTokenRef]?.trim();

  if (!account.channelId || !channelSecret || !channelAccessToken) {
    throw new Error("Missing LINE channel environment variables.");
  }

  return {
    channelAccessToken,
    channelId: account.channelId,
    channelSecret,
    lineAccountId: account.lineAccountId,
  };
}

export async function saveEncryptedLineCredentials({
  channelAccessToken,
  channelSecret,
  lineAccountId,
}: {
  channelAccessToken: string;
  channelSecret: string;
  lineAccountId: string;
}) {
  await getAdminDb()
    .collection("lineAccounts")
    .doc(lineAccountId)
    .collection("credentials")
    .doc("current")
    .set(
      {
        encryptedChannelAccessToken: encryptSecret(channelAccessToken),
        encryptedChannelSecret: encryptSecret(channelSecret),
        encryptionKeyVersion: process.env.APP_ENCRYPTION_KEY_VERSION?.trim() || "v1",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function validateLineCredentialInput({
  channelAccessToken,
  channelId,
  channelSecret,
}: {
  channelAccessToken: string;
  channelId: string;
  channelSecret: string;
}) {
  if (!channelId.trim() || !channelSecret.trim() || !channelAccessToken.trim()) {
    throw new Error("INVALID_LINE_CREDENTIALS");
  }

  const response = await fetch("https://api.line.me/v2/bot/info", {
    headers: {
      Authorization: `Bearer ${channelAccessToken.trim()}`,
    },
  });

  if (!response.ok) {
    throw new Error("INVALID_LINE_ACCESS_TOKEN");
  }
}
