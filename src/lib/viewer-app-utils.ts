import type {
  CalendarEventView,
  CronHistoryItemView,
  MessageView,
  SendRunView,
} from "@/features/messages/types";

export type ViewerView =
  | "calendar"
  | "cron-runs"
  | "generated-message"
  | "home"
  | "messages"
  | "sent"
  | "settings"
  | "users";

export type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message: string;
  };
};

export type CalendarEventDraft = {
  enabled: boolean;
  eventText: string;
  monthDay: string;
};

export type HomeConfirmationTarget = {
  confirmationStatus: NonNullable<SendRunView["targets"][number]["confirmationStatus"]>;
  reminderSentAt: null | string;
  runId: string;
  sentAt: string;
  userId: string;
  userName: string;
};

export const HISTORY_PAGE_LIMIT = 20;

export function buildHistoryPageUrl(path: string, cursor: null | string) {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_LIMIT) });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return `${path}?${params.toString()}`;
}

export function mergeMessagePages(current: MessageView[], incoming: MessageView[]) {
  const messagesById = new Map(current.map((message) => [message.messageId, message]));

  incoming.forEach((message) => messagesById.set(message.messageId, message));

  return [...messagesById.values()].sort(
    (left, right) => right.sentAt.localeCompare(left.sentAt) || right.messageId.localeCompare(left.messageId),
  );
}

export function mergeSendRunPages(current: SendRunView[], incoming: SendRunView[]) {
  const runsById = new Map(current.map((run) => [run.runId, run]));

  incoming.forEach((run) => runsById.set(run.runId, run));

  return [...runsById.values()].sort(
    (left, right) => right.sentAt.localeCompare(left.sentAt) || right.runId.localeCompare(left.runId),
  );
}

export function routeForView(view: ViewerView) {
  if (view === "home") {
    return "/";
  }

  if (view === "settings") {
    return "/settings";
  }

  if (view === "cron-runs") {
    return "/cron-runs";
  }

  if (view === "sent") {
    return "/sent";
  }

  if (view === "users") {
    return "/users";
  }

  if (view === "generated-message") {
    return "/send";
  }

  if (view === "calendar") {
    return "/calendar";
  }

  return "/messages";
}

export function isHomeUnconfirmedTarget(target: HomeConfirmationTarget) {
  return target.confirmationStatus === "pending" || target.confirmationStatus === "reminded";
}

export function compareHomeConfirmationTargets(left: HomeConfirmationTarget, right: HomeConfirmationTarget) {
  return (
    right.sentAt.localeCompare(left.sentAt) ||
    left.userName.localeCompare(right.userName, "ja") ||
    left.userId.localeCompare(right.userId)
  );
}

export function formatHomeTargetNames(targets: HomeConfirmationTarget[]) {
  if (!targets.length) {
    return "なし";
  }

  if (targets.length <= 3) {
    return targets.map((target) => target.userName).join("、");
  }

  const [first, ...rest] = targets;

  return `${first.userName}さんほか${rest.length}名`;
}

export function isSameDateInJapan(value: string, date: Date) {
  return formatDateKeyInJapan(new Date(value)) === formatDateKeyInJapan(date);
}

export function formatDateKeyInJapan(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

export function formatTimeOnly(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function sourceLabel(message: MessageView) {
  if (message.sourceType === "group") {
    return message.sourceGroupName || "ユーザグループ";
  }

  return "個別トーク";
}

export function formatSendRunMode(mode: SendRunView["mode"]) {
  return mode === "auto" ? "自動" : "手動";
}

export function formatSendRunStatus(status: SendRunView["status"]) {
  if (status === "success") {
    return "成功";
  }

  if (status === "partial_failed") {
    return "一部失敗";
  }

  return "失敗";
}

export function formatConfirmationStatus(status: SendRunView["targets"][number]["confirmationStatus"]) {
  if (status === "confirmed") {
    return "確認済み";
  }

  if (status === "reminded") {
    return "未確認（通知済み）";
  }

  if (status === "pending") {
    return "未確認";
  }

  return "対象外";
}

export function formatCronHistoryKind(kind: CronHistoryItemView["kind"]) {
  if (kind === "check_unconfirmed_messages") {
    return "確認チェック";
  }

  if (kind === "delete_expired_messages") {
    return "自動削除";
  }

  return "自動送信";
}

export function formatCronConfirmationTargets(targets: CronHistoryItemView["confirmedTargets"]) {
  if (!targets?.length) {
    return "なし";
  }

  return targets.map((target) => target.userName).join("、");
}

export function formatCronHistoryStatus(status: string) {
  if (status === "success") {
    return "成功";
  }

  if (status === "partial_failed") {
    return "一部失敗";
  }

  if (status === "skipped") {
    return "スキップ";
  }

  return "失敗";
}

export function toCalendarEventDraft(event: CalendarEventView): CalendarEventDraft {
  return {
    enabled: event.enabled,
    eventText: event.eventText,
    monthDay: formatCalendarMonthDayForDisplay(event.monthDay),
  };
}

export function sortCalendarEventsForDisplay(events: CalendarEventView[]) {
  return [...events].sort(
    (left, right) =>
      left.monthDay.localeCompare(right.monthDay) ||
      left.sortOrder - right.sortOrder ||
      (left.createdAt ?? "").localeCompare(right.createdAt ?? "") ||
      left.eventId.localeCompare(right.eventId),
  );
}

export function getTodayCalendarEventsForDisplay(events: CalendarEventView[]) {
  const monthDay = getCalendarMonthDayInJapan(new Date());

  return sortCalendarEventsForDisplay(events.filter((event) => event.enabled && event.monthDay === monthDay));
}

export function getCalendarMonthDayInJapan(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatCalendarMonthDayForDisplay(monthDay: string) {
  return monthDay.replace("-", "/");
}

export function formatCalendarEventsText(events: CalendarEventView[]) {
  return events.map((event) => event.eventText).filter(Boolean).join("、");
}

export function formatAccountEmailLocalPart(email: string) {
  return email.split("@")[0]?.trim() || email;
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok && !payload.error) {
    return {
      error: {
        message: "通信に失敗しました。",
      },
    };
  }

  return payload;
}

export function isPushNotificationSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function ensureServiceWorkerRegistration() {
  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));

  await registration.update().catch(() => undefined);

  return registration;
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
