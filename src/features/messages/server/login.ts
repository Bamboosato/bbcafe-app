import { normalizeLoginId, safeStringEqual, verifyPasswordHash } from "@/lib/server/crypto";
import { DEFAULT_LINE_ACCOUNT_ID, getLineAccount } from "./lineAccounts";

export const DEFAULT_ADMIN_LOGIN_ID = "admin";

export function getConfiguredAdminLoginId() {
  return process.env.ADMIN_LOGIN_ID?.trim() || DEFAULT_ADMIN_LOGIN_ID;
}

export function isConfiguredAdminLoginId(value: string) {
  return safeStringEqual(normalizeLoginId(value), normalizeLoginId(getConfiguredAdminLoginId()));
}

export async function verifyConfiguredAdminPassword(password: string) {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();

  if (!passwordHash) {
    return {
      configured: false,
      valid: false,
    };
  }

  return {
    configured: true,
    valid: await verifyPasswordHash(password, passwordHash),
  };
}

export async function verifyViewerCredentials({
  lineAccountId = DEFAULT_LINE_ACCOUNT_ID,
  password,
  sharedId,
}: {
  lineAccountId?: string;
  password: string;
  sharedId: string;
}) {
  const account = await getLineAccount(lineAccountId);

  if (!account.viewerPasswordHash) {
    return {
      account,
      configured: false,
      valid: false,
    };
  }

  const sharedIdValid = safeStringEqual(
    normalizeLoginId(sharedId),
    normalizeLoginId(account.viewerSharedId),
  );
  const passwordValid = await verifyPasswordHash(password, account.viewerPasswordHash);

  return {
    account,
    configured: true,
    valid: sharedIdValid && passwordValid,
  };
}
