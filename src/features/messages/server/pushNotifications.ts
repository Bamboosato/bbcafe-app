import { FieldValue } from "firebase-admin/firestore";
import * as webPush from "web-push";
import { stableHash } from "@/lib/server/crypto";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString } from "@/lib/server/firestoreUtils";

const PUSH_SUBSCRIPTIONS_COLLECTION = "pushSubscriptions";
const MAX_SUBSCRIPTIONS_PER_ACCOUNT = 500;

type PushSubscriptionRecord = {
  createdAt: null | string;
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
  lineAccountId: string;
  subscriptionId: string;
  updatedAt: null | string;
  userAgent: null | string;
  viewerSharedId: string;
};

type WebPushConfig = {
  privateKey: string;
  publicKey: string;
  subject: string;
};

type UpsertPushSubscriptionInput = {
  lineAccountId: string;
  subscription: unknown;
  userAgent?: null | string;
  viewerSharedId: string;
};

type DeletePushSubscriptionInput = {
  endpoint: unknown;
  lineAccountId: string;
  viewerSharedId: string;
};

type SendNewMessagePushNotificationsInput = {
  lineAccountId: string;
  viewerSharedId: string;
};

let configuredVapidKey = "";

export function getWebPushPublicKey() {
  return getWebPushConfig()?.publicKey ?? null;
}

export function normalizePushSubscription(value: unknown): webPush.PushSubscription | null {
  if (!isObject(value)) {
    return null;
  }

  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
  const keys = isObject(value.keys) ? value.keys : null;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys?.auth === "string" ? keys.auth.trim() : "";
  const expirationTime = typeof value.expirationTime === "number" ? value.expirationTime : null;

  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    expirationTime,
    keys: {
      auth,
      p256dh,
    },
  };
}

export function buildNewMessagePushPayload(viewerSharedId: string) {
  return {
    body: `${viewerSharedId} 新しいメッセージがあります`,
    tag: `new-message:${viewerSharedId}`,
    title: "BB Cafe Messages",
    url: "/",
  };
}

export async function upsertPushSubscription(input: UpsertPushSubscriptionInput) {
  const subscription = normalizePushSubscription(input.subscription);

  if (!subscription) {
    throw new Error("INVALID_PUSH_SUBSCRIPTION");
  }

  const db = getAdminDb();
  const subscriptionId = createPushSubscriptionId(subscription.endpoint);
  const ref = db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(subscriptionId);
  const userAgent = input.userAgent?.trim() ? input.userAgent.trim().slice(0, 500) : null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const commonFields = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: subscription.keys,
      lineAccountId: input.lineAccountId,
      subscriptionId,
      updatedAt: FieldValue.serverTimestamp(),
      userAgent,
      viewerSharedId: input.viewerSharedId,
    };

    transaction.set(
      ref,
      snapshot.exists
        ? commonFields
        : {
            ...commonFields,
            createdAt: FieldValue.serverTimestamp(),
          },
      { merge: true },
    );
  });

  return {
    subscriptionId,
  };
}

export async function deletePushSubscription(input: DeletePushSubscriptionInput) {
  const endpoint = normalizePushEndpoint(input.endpoint);

  if (!endpoint) {
    throw new Error("INVALID_PUSH_SUBSCRIPTION");
  }

  const db = getAdminDb();
  const ref = db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(createPushSubscriptionId(endpoint));
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  const record = toPushSubscriptionRecord(snapshot.id, snapshot.data() ?? {});

  if (record.lineAccountId !== input.lineAccountId || record.viewerSharedId !== input.viewerSharedId) {
    return false;
  }

  await ref.delete();

  return true;
}

export async function sendNewMessagePushNotifications(input: SendNewMessagePushNotificationsInput) {
  const config = configureWebPush();

  if (!config) {
    return {
      failed: 0,
      sent: 0,
      skipped: "missing_web_push_config" as const,
      staleDeleted: 0,
    };
  }

  const db = getAdminDb();
  const snapshot = await db
    .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
    .where("lineAccountId", "==", input.lineAccountId)
    .limit(MAX_SUBSCRIPTIONS_PER_ACCOUNT)
    .get();

  const payload = JSON.stringify(buildNewMessagePushPayload(input.viewerSharedId));
  let failed = 0;
  let sent = 0;
  let staleDeleted = 0;

  for (const doc of snapshot.docs) {
    const record = toPushSubscriptionRecord(doc.id, doc.data());

    if (record.viewerSharedId !== input.viewerSharedId) {
      continue;
    }

    try {
      await webPush.sendNotification(
        {
          endpoint: record.endpoint,
          keys: record.keys,
        },
        payload,
        {
          TTL: 60 * 60,
        },
      );
      sent += 1;
    } catch (error) {
      if (isExpiredSubscriptionError(error)) {
        await doc.ref.delete();
        staleDeleted += 1;
        continue;
      }

      failed += 1;
      console.warn("[push-notification] send failed", {
        message: error instanceof Error ? error.message : String(error),
        subscriptionId: record.subscriptionId,
      });
    }
  }

  return {
    failed,
    sent,
    skipped: null,
    staleDeleted,
  };
}

function configureWebPush() {
  const config = getWebPushConfig();

  if (!config) {
    return null;
  }

  const configKey = stableHash(`${config.subject}:${config.publicKey}:${config.privateKey}`);

  if (configuredVapidKey !== configKey) {
    webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configuredVapidKey = configKey;
  }

  return config;
}

function getWebPushConfig(): WebPushConfig | null {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() ?? "";

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return {
    privateKey,
    publicKey,
    subject,
  };
}

function createPushSubscriptionId(endpoint: string) {
  return `push_${stableHash(endpoint).slice(0, 32)}`;
}

function normalizePushEndpoint(value: unknown) {
  const endpoint = typeof value === "string" ? value.trim() : "";

  return endpoint.startsWith("https://") ? endpoint : null;
}

function toPushSubscriptionRecord(subscriptionId: string, data: FirebaseFirestore.DocumentData): PushSubscriptionRecord {
  const keys = isObject(data.keys) ? data.keys : {};

  return {
    createdAt: toIsoString(data.createdAt),
    endpoint: String(data.endpoint ?? ""),
    keys: {
      auth: String(keys.auth ?? ""),
      p256dh: String(keys.p256dh ?? ""),
    },
    lineAccountId: String(data.lineAccountId ?? ""),
    subscriptionId: String(data.subscriptionId ?? subscriptionId),
    updatedAt: toIsoString(data.updatedAt),
    userAgent: typeof data.userAgent === "string" ? data.userAgent : null,
    viewerSharedId: String(data.viewerSharedId ?? ""),
  };
}

function isExpiredSubscriptionError(error: unknown) {
  return (
    error instanceof webPush.WebPushError &&
    (error.statusCode === 404 || error.statusCode === 410)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
