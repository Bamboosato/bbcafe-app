import { describe, expect, it } from "vitest";
import { getSenderProfilePath } from "./line";

describe("LINE sender profile path", () => {
  it("uses the group member profile API for group messages", () => {
    expect(
      getSenderProfilePath({
        groupId: "Cgroup/with space",
        sourceType: "group",
        sourceUserId: "Uuser+1",
      }),
    ).toBe("/v2/bot/group/Cgroup%2Fwith%20space/member/Uuser%2B1");
  });

  it("uses the room member profile API for room messages", () => {
    expect(
      getSenderProfilePath({
        groupId: "Rroom",
        sourceType: "room",
        sourceUserId: "Uuser",
      }),
    ).toBe("/v2/bot/room/Rroom/member/Uuser");
  });

  it("uses the user profile API for personal messages", () => {
    expect(
      getSenderProfilePath({
        groupId: null,
        sourceType: "user",
        sourceUserId: "Uuser",
      }),
    ).toBe("/v2/bot/profile/Uuser");
  });

  it("returns null when the webhook event does not include a user ID", () => {
    expect(
      getSenderProfilePath({
        groupId: "Cgroup",
        sourceType: "group",
        sourceUserId: null,
      }),
    ).toBeNull();
  });
});
