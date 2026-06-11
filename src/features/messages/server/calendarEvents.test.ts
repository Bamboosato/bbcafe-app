import { describe, expect, it } from "vitest";
import {
  CalendarEventValidationError,
  filterCalendarEventsForDate,
  normalizeCalendarEventInput,
  normalizeCalendarEventText,
} from "./calendarEvents";
import type { CalendarEventView } from "../types";

describe("calendar event input normalization", () => {
  it("normalizes MM/DD input and trims event text", () => {
    expect(
      normalizeCalendarEventInput({
        eventText: " 千夏子の誕生日 ",
        monthDay: "07/29",
      }),
    ).toEqual({
      day: 29,
      enabled: true,
      eventText: "千夏子の誕生日",
      month: 7,
      monthDay: "07-29",
    });
  });

  it("normalizes repeated whitespace in event text", () => {
    expect(normalizeCalendarEventText("岳夫と　 由美子の結婚記念日")).toBe("岳夫と 由美子の結婚記念日");
  });

  it("allows February 29", () => {
    expect(
      normalizeCalendarEventInput({
        eventText: "うるう日の記念日",
        monthDay: "02/29",
      }).monthDay,
    ).toBe("02-29");
  });

  it("rejects impossible dates", () => {
    expect(() =>
      normalizeCalendarEventInput({
        eventText: "存在しない日",
        monthDay: "04/31",
      }),
    ).toThrow(CalendarEventValidationError);
  });

  it("rejects long event text", () => {
    expect(() =>
      normalizeCalendarEventInput({
        eventText: "あ".repeat(41),
        monthDay: "07/29",
      }),
    ).toThrow(CalendarEventValidationError);
  });
});

describe("calendar event date filtering", () => {
  it("uses Japan time and only returns enabled events for the day", () => {
    const events = [
      calendarEvent({ enabled: true, eventId: "one", eventText: "千夏子の誕生日", monthDay: "07-29" }),
      calendarEvent({ enabled: false, eventId: "two", eventText: "無効な予定", monthDay: "07-29" }),
      calendarEvent({ enabled: true, eventId: "three", eventText: "別の日", monthDay: "07-30" }),
    ];

    expect(filterCalendarEventsForDate(events, new Date("2026-07-28T15:00:00Z"))).toEqual([events[0]]);
  });
});

function calendarEvent({
  enabled,
  eventId,
  eventText,
  monthDay,
}: {
  enabled: boolean;
  eventId: string;
  eventText: string;
  monthDay: string;
}): CalendarEventView {
  const [month, day] = monthDay.split("-").map(Number);

  return {
    createdAt: null,
    day: day ?? 1,
    enabled,
    eventId,
    eventText,
    lineAccountId: "default",
    month: month ?? 1,
    monthDay,
    sortOrder: 0,
    updatedAt: null,
  };
}
