import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

function requiredPublicEnv(value: string | undefined, name: string) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return normalizedValue;
}

export function getClientAuth() {
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: requiredPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, "NEXT_PUBLIC_FIREBASE_API_KEY"),
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
      authDomain: requiredPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
      projectId: requiredPublicEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    });

  return getAuth(app);
}
