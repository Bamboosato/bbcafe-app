import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

function requiredPublicEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getClientAuth() {
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: requiredPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
      authDomain: requiredPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
      projectId: requiredPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    });

  return getAuth(app);
}
