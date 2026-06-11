import { FieldValue } from "firebase-admin/firestore";
import { randomHex } from "@/lib/server/crypto";
import { getAdminDb } from "@/lib/server/firebase";
import { toIsoString } from "@/lib/server/firestoreUtils";
import type { CalendarEventView } from "../types";

export const CALENDAR_EVENT_TEXT_MAX_LENGTH = 40;
export const CALENDAR_EVENT_TIME_ZONE = "Asia/Tokyo";

const MAX_CALENDAR_EVENTS = 500;

type CalendarEventInput = {
  day?: unknown;
  enabled?: unknown;
  eventText?: unknown;
  month?: unknown;
  monthDay?: unknown;
};

type NormalizedCalendarEventInput = {
  day: number;
  enabled: boolean;
  eventText: string;
  month: number;
  monthDay: string;
};

export class CalendarEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarEventValidationError";
  }
}

export function normalizeCalendarEventInput(input: CalendarEventInput): NormalizedCalendarEventInput {
  const dateParts = parseCalendarMonthDay(input);
  const eventText = normalizeCalendarEventText(typeof input.eventText === "string" ? input.eventText : "");

  if (!eventText) {
    throw new CalendarEventValidationError("イベントを入力してください。");
  }

  if (eventText.length > CALENDAR_EVENT_TEXT_MAX_LENGTH) {
    throw new CalendarEventValidationError(`イベントは${CALENDAR_EVENT_TEXT_MAX_LENGTH}文字以内で入力してください。`);
  }

  return {
    ...dateParts,
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    eventText,
  };
}

export function normalizeCalendarEventText(value: string) {
  return value.trim().replace(/[\s\u3000]+/g, " ");
}

export function formatCalendarMonthDay(month: number, day: number) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatCalendarMonthDayForDisplay(monthDay: string) {
  return monthDay.replace("-", "/");
}

export function getCalendarMonthDayInJapan(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
    timeZone: CALENDAR_EVENT_TIME_ZONE,
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Could not determine date parts in time zone: ${CALENDAR_EVENT_TIME_ZONE}`);
  }

  return formatCalendarMonthDay(month, day);
}

export function filterCalendarEventsForDate(events: CalendarEventView[], date = new Date()) {
  const monthDay = getCalendarMonthDayInJapan(date);

  return sortCalendarEvents(events.filter((event) => event.enabled && event.monthDay === monthDay));
}

export function buildCalendarEventsSummary(events: Array<Pick<CalendarEventView, "eventText">>) {
  return events.map((event) => event.eventText).filter(Boolean).join("、");
}

export async function listCalendarEvents(lineAccountId: string): Promise<CalendarEventView[]> {
  const snapshot = await calendarEventsCollection(lineAccountId).limit(MAX_CALENDAR_EVENTS).get();

  return sortCalendarEvents(snapshot.docs.map((doc) => toCalendarEventView(lineAccountId, doc.id, doc.data())));
}

export async function listTodayCalendarEvents(lineAccountId: string, date = new Date()) {
  return filterCalendarEventsForDate(await listCalendarEvents(lineAccountId), date);
}

export async function createCalendarEvent(lineAccountId: string, input: CalendarEventInput) {
  const normalized = normalizeCalendarEventInput(input);
  await assertNoDuplicateCalendarEvent(lineAccountId, normalized);

  const eventId = `cal_${randomHex(8)}`;
  const ref = calendarEventsCollection(lineAccountId).doc(eventId);

  await ref.set({
    createdAt: FieldValue.serverTimestamp(),
    day: normalized.day,
    enabled: normalized.enabled,
    eventId,
    eventText: normalized.eventText,
    lineAccountId,
    month: normalized.month,
    monthDay: normalized.monthDay,
    sortOrder: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot = await ref.get();

  return toCalendarEventView(lineAccountId, snapshot.id, snapshot.data() ?? {});
}

export async function updateCalendarEvent(lineAccountId: string, eventId: string, input: CalendarEventInput) {
  const ref = calendarEventsCollection(lineAccountId).doc(eventId);
  const snapshot = await ref.get();

  if (!snapshot.exists || snapshot.data()?.lineAccountId !== lineAccountId) {
    return null;
  }

  const normalized = normalizeCalendarEventInput(input);
  await assertNoDuplicateCalendarEvent(lineAccountId, normalized, eventId);

  await ref.set(
    {
      day: normalized.day,
      enabled: normalized.enabled,
      eventText: normalized.eventText,
      lineAccountId,
      month: normalized.month,
      monthDay: normalized.monthDay,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const nextSnapshot = await ref.get();

  return toCalendarEventView(lineAccountId, nextSnapshot.id, nextSnapshot.data() ?? {});
}

export async function deleteCalendarEvent(lineAccountId: string, eventId: string) {
  const ref = calendarEventsCollection(lineAccountId).doc(eventId);
  const snapshot = await ref.get();

  if (!snapshot.exists || snapshot.data()?.lineAccountId !== lineAccountId) {
    return false;
  }

  await ref.delete();

  return true;
}

function parseCalendarMonthDay(input: CalendarEventInput) {
  if (typeof input.monthDay === "string") {
    const parsed = parseMonthDayString(input.monthDay);

    if (parsed) {
      return parsed;
    }
  }

  const month = Number(input.month);
  const day = Number(input.day);

  if (!isValidMonthDay(month, day)) {
    throw new CalendarEventValidationError("月日が正しくありません。");
  }

  return {
    day,
    month,
    monthDay: formatCalendarMonthDay(month, day),
  };
}

function parseMonthDayString(value: string) {
  const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})$/);

  if (!match) {
    throw new CalendarEventValidationError("月日はMM/DD形式で入力してください。");
  }

  const month = Number(match[1]);
  const day = Number(match[2]);

  if (!isValidMonthDay(month, day)) {
    throw new CalendarEventValidationError("月日が正しくありません。");
  }

  return {
    day,
    month,
    monthDay: formatCalendarMonthDay(month, day),
  };
}

function isValidMonthDay(month: number, day: number) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= (daysByMonth[month - 1] ?? 0);
}

async function assertNoDuplicateCalendarEvent(
  lineAccountId: string,
  input: NormalizedCalendarEventInput,
  ignoreEventId?: string,
) {
  const snapshot = await calendarEventsCollection(lineAccountId)
    .where("monthDay", "==", input.monthDay)
    .limit(MAX_CALENDAR_EVENTS)
    .get();

  const duplicate = snapshot.docs.some((doc) => {
    if (doc.id === ignoreEventId) {
      return false;
    }

    return normalizeCalendarEventText(String(doc.data().eventText ?? "")) === input.eventText;
  });

  if (duplicate) {
    throw new CalendarEventValidationError("同じ月日とイベントがすでに登録されています。");
  }
}

function sortCalendarEvents(events: CalendarEventView[]) {
  return [...events].sort(
    (left, right) =>
      left.monthDay.localeCompare(right.monthDay) ||
      left.sortOrder - right.sortOrder ||
      left.createdAt?.localeCompare(right.createdAt ?? "") ||
      left.eventId.localeCompare(right.eventId),
  );
}

function calendarEventsCollection(lineAccountId: string) {
  return getAdminDb().collection("lineAccounts").doc(lineAccountId).collection("calendarEvents");
}

function toCalendarEventView(
  lineAccountId: string,
  eventId: string,
  data: FirebaseFirestore.DocumentData,
): CalendarEventView {
  const month = Number(data.month);
  const day = Number(data.day);
  const normalizedMonth = Number.isInteger(month) ? month : 1;
  const normalizedDay = Number.isInteger(day) ? day : 1;

  return {
    createdAt: toIsoString(data.createdAt),
    day: normalizedDay,
    enabled: data.enabled !== false,
    eventId: String(data.eventId ?? eventId),
    eventText: String(data.eventText ?? ""),
    lineAccountId: String(data.lineAccountId ?? lineAccountId),
    month: normalizedMonth,
    monthDay: String(data.monthDay ?? formatCalendarMonthDay(normalizedMonth, normalizedDay)),
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    updatedAt: toIsoString(data.updatedAt),
  };
}
