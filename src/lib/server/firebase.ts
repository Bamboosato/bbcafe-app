import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return trimEnvJsonArtifacts(value);
}

function trimEnvJsonArtifacts(value: string) {
  let normalized = value.trim();

  if (normalized.endsWith(",")) {
    normalized = normalized.slice(0, -1).trim();
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  } else {
    normalized = normalized.replace(/^["']+/, "").replace(/["']+$/, "");
  }

  return normalized.trim();
}

function normalizePrivateKey(value: string) {
  const normalized = trimEnvJsonArtifacts(value).replace(/\\n/g, "\n");
  const header = "-----BEGIN PRIVATE KEY-----";
  const footer = "-----END PRIVATE KEY-----";
  const start = normalized.indexOf(header);
  const end = normalized.indexOf(footer);

  if (start >= 0 && end >= start) {
    return normalized.slice(start, end + footer.length);
  }

  return normalized;
}

export function getAdminDb() {
  if (!getApps().length) {
    const projectId = requiredEnv("FIREBASE_PROJECT_ID");
    const clientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL");
    const privateKey = normalizePrivateKey(requiredEnv("FIREBASE_PRIVATE_KEY"));

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return getFirestore();
}
