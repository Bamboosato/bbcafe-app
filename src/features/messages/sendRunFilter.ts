import type { SendRunMode, SendRunView } from "./types";

export type SendRunFilter = "all" | SendRunMode;

export const SEND_RUN_FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: SendRunFilter;
}> = [
  { label: "ALL", value: "all" },
  { label: "自動", value: "auto" },
  { label: "手動", value: "manual" },
];

export function matchesSendRunFilter(run: SendRunView, filter: SendRunFilter) {
  if (filter === "all") {
    return true;
  }

  return run.mode === filter;
}

export function filterSendRuns(runs: readonly SendRunView[], filter: SendRunFilter) {
  return runs.filter((run) => matchesSendRunFilter(run, filter));
}
