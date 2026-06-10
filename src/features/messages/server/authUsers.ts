import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/server/firebase";
import { normalizeLoginId, stableHash } from "@/lib/server/crypto";
import {
  DEFAULT_LINE_ACCOUNT_ID,
  DEFAULT_RETENTION_DAYS,
} from "./lineAccounts";

export type AuthUserRecord = {
  email: string;
  lineAccountId: string;
  status: "active" | "disabled";
  uid: string;
};

export async function getOrProvisionAuthUser(decodedToken: DecodedIdToken): Promise<AuthUserRecord> {
  const uid = decodedToken.uid;
  const email = typeof decodedToken.email === "string" ? decodedToken.email.trim() : "";
  const db = getAdminDb();
  const ref = db.collection("authUsers").doc(uid);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    return toAuthUserRecord(uid, snapshot.data() ?? {}, email);
  }

  const lineAccountId = resolveInitialLineAccountId(email, uid);
  const record = {
    createdAt: FieldValue.serverTimestamp(),
    email,
    lineAccountId,
    status: "active",
    uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(ref);

    if (currentSnapshot.exists) {
      return;
    }

    transaction.set(ref, record);
    transaction.set(
      db.collection("lineAccounts").doc(lineAccountId),
      {
        createdAt: FieldValue.serverTimestamp(),
        displayName: lineAccountId === DEFAULT_LINE_ACCOUNT_ID ? "BBカフェ" : "",
        lineAccountId,
        ownerUid: uid,
        retentionDays: DEFAULT_RETENTION_DAYS,
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
        ...(lineAccountId === DEFAULT_LINE_ACCOUNT_ID ? {} : { credentialProvider: "encryptedFirestore" }),
      },
      { merge: true },
    );
  });

  const nextSnapshot = await ref.get();

  return toAuthUserRecord(uid, nextSnapshot.data() ?? record, email);
}

function resolveInitialLineAccountId(email: string, uid: string) {
  const initialOwnerUid = process.env.INITIAL_OWNER_UID?.trim();
  const initialOwnerEmail = process.env.INITIAL_OWNER_EMAIL?.trim();

  if (initialOwnerUid && uid === initialOwnerUid) {
    return process.env.INITIAL_LINE_ACCOUNT_ID?.trim() || DEFAULT_LINE_ACCOUNT_ID;
  }

  if (
    initialOwnerEmail &&
    email &&
    normalizeLoginId(email) === normalizeLoginId(initialOwnerEmail)
  ) {
    return process.env.INITIAL_LINE_ACCOUNT_ID?.trim() || DEFAULT_LINE_ACCOUNT_ID;
  }

  return `user_${stableHash(uid).slice(0, 24)}`;
}

function toAuthUserRecord(
  uid: string,
  data: FirebaseFirestore.DocumentData,
  fallbackEmail: string,
): AuthUserRecord {
  return {
    email: String(data.email ?? fallbackEmail),
    lineAccountId: String(data.lineAccountId ?? ""),
    status: data.status === "disabled" ? "disabled" : "active",
    uid: String(data.uid ?? uid),
  };
}
