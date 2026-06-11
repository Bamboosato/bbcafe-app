import { Timestamp } from "firebase-admin/firestore";

export const DEFAULT_HISTORY_PAGE_LIMIT = 20;
export const MAX_HISTORY_PAGE_LIMIT = 50;

type EncodedHistoryCursor = {
  sentAt?: unknown;
};

export class InvalidHistoryCursorError extends Error {
  constructor() {
    super("Invalid history cursor.");
    this.name = "InvalidHistoryCursorError";
  }
}

export function normalizeHistoryPageLimit(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_HISTORY_PAGE_LIMIT;
  }

  return Math.min(value, MAX_HISTORY_PAGE_LIMIT);
}

export function encodeHistoryCursor(sentAt: string) {
  const parsed = Date.parse(sentAt);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return Buffer.from(JSON.stringify({ sentAt: new Date(parsed).toISOString() }), "utf8").toString("base64url");
}

export function parseHistoryCursor(value: null | string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as EncodedHistoryCursor;

    if (typeof decoded.sentAt !== "string") {
      throw new InvalidHistoryCursorError();
    }

    const parsed = Date.parse(decoded.sentAt);

    if (Number.isNaN(parsed)) {
      throw new InvalidHistoryCursorError();
    }

    return Timestamp.fromDate(new Date(parsed));
  } catch (error) {
    if (error instanceof InvalidHistoryCursorError) {
      throw error;
    }

    throw new InvalidHistoryCursorError();
  }
}
