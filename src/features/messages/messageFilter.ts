import type { MessageView } from "./types";

export type MessageFilter = "all" | "group" | "personal";

export const MESSAGE_FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: MessageFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Group", value: "group" },
  { label: "Personal", value: "personal" },
];

export function matchesMessageFilter(message: MessageView, filter: MessageFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "group") {
    return message.sourceType === "group";
  }

  return message.sourceType === "user";
}

export function filterMessages(messages: readonly MessageView[], filter: MessageFilter) {
  return messages.filter((message) => matchesMessageFilter(message, filter));
}
