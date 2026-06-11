import { describe, expect, it } from "vitest";
import { parseRequestedUserIds, resolveManualSendUsers } from "./route";
import type { UserInfoView } from "@/features/messages/types";

describe("manual message recipient selection", () => {
  it("deduplicates and trims requested user IDs", () => {
    expect(parseRequestedUserIds([" U1 ", "U2", "U1", "", 123])).toEqual(["U1", "U2"]);
  });

  it("rejects non-array requested user IDs", () => {
    expect(parseRequestedUserIds("U1")).toBeNull();
  });

  it("uses all persistent selected users when no manual request is provided", () => {
    const users = [user("U1", "Takeo Sato"), user("U2", "佐藤由美子")];

    expect(resolveManualSendUsers(users, undefined)).toEqual(users);
  });

  it("keeps only requested users that are in the persistent selected user list", () => {
    const users = [user("U1", "Takeo Sato"), user("U2", "佐藤由美子")];

    expect(resolveManualSendUsers(users, ["U2", "U3"])).toEqual([users[1]]);
  });
});

function user(userId: string, userName: string): UserInfoView {
  return {
    broadcastSelected: true,
    fetchedAt: "2026-06-11T00:00:00.000Z",
    firstSeenAt: "2026-06-11T00:00:00.000Z",
    lastMessageAt: "2026-06-11T00:00:00.000Z",
    lastSeenAt: "2026-06-11T00:00:00.000Z",
    lineAccountId: "default",
    userId,
    userName,
  };
}
