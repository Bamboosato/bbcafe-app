import { describe, expect, it } from "vitest";
import { filterMessages, matchesMessageFilter } from "./messageFilter";
import type { MessageView } from "./types";

function createMessage(messageId: string, sourceType: MessageView["sourceType"]): MessageView {
  return {
    expiresAt: "2026-05-28T00:00:00.000Z",
    lineAccountId: "default",
    messageId,
    messageType: "text",
    sentAt: "2026-05-27T00:00:00.000Z",
    senderDisplayName: "sender",
    sourceGroupId: sourceType === "group" ? "group-1" : null,
    sourceGroupName: sourceType === "group" ? "group name" : null,
    sourceType,
    text: "message text",
  };
}

describe("message source filter", () => {
  const groupMessage = createMessage("group-message", "group");
  const personalMessage = createMessage("personal-message", "user");
  const messages = [groupMessage, personalMessage];

  it("keeps group and personal messages when All is selected", () => {
    expect(filterMessages(messages, "all").map((message) => message.messageId)).toEqual([
      "group-message",
      "personal-message",
    ]);
  });

  it("keeps only group messages when Group is selected", () => {
    expect(filterMessages(messages, "group").map((message) => message.messageId)).toEqual(["group-message"]);
    expect(matchesMessageFilter(personalMessage, "group")).toBe(false);
  });

  it("keeps only personal messages when Personal is selected", () => {
    expect(filterMessages(messages, "personal").map((message) => message.messageId)).toEqual(["personal-message"]);
    expect(matchesMessageFilter(groupMessage, "personal")).toBe(false);
  });
});
