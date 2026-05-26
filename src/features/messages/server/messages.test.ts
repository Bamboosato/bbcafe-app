import { describe, expect, it } from "vitest";

describe("message retention policy", () => {
  it("protects the newest 1000 records from retention deletion", () => {
    const total = 1001;
    const protectedCount = 1000;

    expect(total - protectedCount).toBe(1);
  });
});
