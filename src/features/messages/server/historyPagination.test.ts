import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORY_PAGE_LIMIT,
  InvalidHistoryCursorError,
  MAX_HISTORY_PAGE_LIMIT,
  encodeHistoryCursor,
  normalizeHistoryPageLimit,
  parseHistoryCursor,
} from "./historyPagination";

describe("historyPagination", () => {
  it("normalizes invalid and oversized page limits", () => {
    expect(normalizeHistoryPageLimit(Number.NaN)).toBe(DEFAULT_HISTORY_PAGE_LIMIT);
    expect(normalizeHistoryPageLimit(0)).toBe(DEFAULT_HISTORY_PAGE_LIMIT);
    expect(normalizeHistoryPageLimit(MAX_HISTORY_PAGE_LIMIT + 1)).toBe(MAX_HISTORY_PAGE_LIMIT);
    expect(normalizeHistoryPageLimit(20)).toBe(20);
  });

  it("round-trips a sentAt cursor", () => {
    const cursor = encodeHistoryCursor("2026-06-11T06:30:00.000Z");

    expect(cursor).toBeTruthy();
    expect(parseHistoryCursor(cursor)?.toDate().toISOString()).toBe("2026-06-11T06:30:00.000Z");
  });

  it("rejects malformed cursors", () => {
    expect(() => parseHistoryCursor("not-a-cursor")).toThrow(InvalidHistoryCursorError);
  });
});
