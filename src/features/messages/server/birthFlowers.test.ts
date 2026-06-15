import { describe, expect, it } from "vitest";
import {
  BIRTH_FLOWERS_BY_MONTH_DAY,
  formatMonthDayKey,
  getBirthFlowerByMonthDay,
  getBirthFlowerForDate,
  getBirthFlowerSourceUrl,
} from "./birthFlowers";

const DAYS_IN_MONTH = new Map([
  ["01", 31],
  ["02", 29],
  ["03", 31],
  ["04", 30],
  ["05", 31],
  ["06", 30],
  ["07", 31],
  ["08", 31],
  ["09", 30],
  ["10", 31],
  ["11", 30],
  ["12", 31],
]);

describe("birth flower master data", () => {
  it("contains one entry for every month-day including leap day", () => {
    const keys = Object.keys(BIRTH_FLOWERS_BY_MONTH_DAY);

    expect(keys).toHaveLength(366);
    expect(new Set(keys).size).toBe(366);
    expect(keys).toContain("02-29");
  });

  it("uses valid MM-DD keys with non-empty flower names and flower languages", () => {
    for (const [monthDay, birthFlower] of Object.entries(BIRTH_FLOWERS_BY_MONTH_DAY)) {
      const [month, day] = monthDay.split("-");
      const dayNumber = Number(day);

      expect(monthDay).toMatch(/^\d{2}-\d{2}$/);
      expect(DAYS_IN_MONTH.has(month)).toBe(true);
      expect(dayNumber).toBeGreaterThanOrEqual(1);
      expect(dayNumber).toBeLessThanOrEqual(DAYS_IN_MONTH.get(month) ?? 0);
      expect(birthFlower.flower.trim()).not.toBe("");
      expect(birthFlower.language.trim()).not.toBe("");
    }
  });

  it("returns the selected source value for June 15", () => {
    expect(getBirthFlowerByMonthDay("06-15")).toEqual({
      flower: "ムラサキツユクサ",
      language: "尊敬しています",
    });
    expect(getBirthFlowerSourceUrl("06-15")).toBe("https://www.i879.com/birth/flower/06/15/");
  });

  it("returns null for an invalid month-day", () => {
    expect(getBirthFlowerByMonthDay("06-31")).toBeNull();
    expect(getBirthFlowerSourceUrl("06-31")).toBeNull();
  });

  it("uses the Japan calendar date by default", () => {
    const date = new Date("2026-06-14T15:00:00Z");

    expect(formatMonthDayKey(date)).toBe("06-15");
    expect(getBirthFlowerForDate(date)).toEqual({
      flower: "ムラサキツユクサ",
      language: "尊敬しています",
    });
  });
});
