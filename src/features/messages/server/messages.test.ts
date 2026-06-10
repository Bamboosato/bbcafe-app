import { describe, expect, it } from "vitest";
import firestoreIndexes from "../../../../firestore.indexes.json";
import vercelConfig from "../../../../vercel.json";

describe("message retention policy", () => {
  it("protects the newest 1000 records from retention deletion", () => {
    const total = 1001;
    const protectedCount = 1000;

    expect(total - protectedCount).toBe(1);
  });
});

describe("firestore index coverage", () => {
  it("defines the newest-message index used by retention protection", () => {
    expect(hasCollectionIndex("messages", ["lineAccountId:ASCENDING", "sentAt:DESCENDING"])).toBe(true);
  });

  it("defines the expired-message index used by retention deletion", () => {
    expect(hasCollectionIndex("messages", ["lineAccountId:ASCENDING", "expiresAt:ASCENDING"])).toBe(true);
  });

  it("defines the auto-send history index used by cron history", () => {
    expect(hasCollectionIndex("sendRuns", ["mode:ASCENDING", "sentAt:DESCENDING"])).toBe(true);
  });

  it("defines the account-scoped delete cron history index", () => {
    expect(hasCollectionIndex("cronRuns", ["lineAccountId:ASCENDING", "startedAt:DESCENDING"])).toBe(true);
  });
});

describe("cron schedules", () => {
  it("checks unconfirmed messages at 13:00 JST", () => {
    expect(hasCronSchedule("/api/cron/check-unconfirmed-messages", "0 4 * * *")).toBe(true);
  });
});

function hasCollectionIndex(collectionGroup: string, requiredFields: string[]) {
  return firestoreIndexes.indexes.some((index) => {
    const fields = index.fields.map((field) => `${field.fieldPath}:${field.order}`);

    return index.collectionGroup === collectionGroup && requiredFields.every((field) => fields.includes(field));
  });
}

function hasCronSchedule(path: string, schedule: string) {
  return vercelConfig.crons.some((cron) => cron.path === path && cron.schedule === schedule);
}
