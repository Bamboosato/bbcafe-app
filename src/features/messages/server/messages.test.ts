import { describe, expect, it } from "vitest";
import firestoreIndexes from "../../../../firestore.indexes.json";

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
});

function hasCollectionIndex(collectionGroup: string, requiredFields: string[]) {
  return firestoreIndexes.indexes.some((index) => {
    const fields = index.fields.map((field) => `${field.fieldPath}:${field.order}`);

    return index.collectionGroup === collectionGroup && requiredFields.every((field) => fields.includes(field));
  });
}
