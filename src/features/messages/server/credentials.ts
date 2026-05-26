import { getLineAccount } from "./lineAccounts";

export type LineCredentials = {
  channelAccessToken: string;
  channelId: string;
  channelSecret: string;
  lineAccountId: string;
};

export async function getLineCredentials(lineAccountId: string): Promise<LineCredentials> {
  const account = await getLineAccount(lineAccountId);

  if (account.credentialProvider !== "env") {
    throw new Error("Encrypted Firestore credentials are not implemented yet.");
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
