import type {
  ConfirmationReminderRunView,
  CronHistoryItemView,
  CronRunView,
  SendRunView,
} from "../types";

export function buildCronHistoryItems({
  deleteRuns,
  limit = 50,
  reminderRuns = [],
  sendRuns,
}: {
  deleteRuns: CronRunView[];
  limit?: number;
  reminderRuns?: ConfirmationReminderRunView[];
  sendRuns: SendRunView[];
}): CronHistoryItemView[] {
  return [
    ...deleteRuns.map(toDeleteHistoryItem),
    ...sendRuns.filter((run) => run.mode === "auto").map(toSendHistoryItem),
    ...reminderRuns.map(toReminderHistoryItem),
  ]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id))
    .slice(0, normalizeLimit(limit));
}

function toDeleteHistoryItem(run: CronRunView): CronHistoryItemView {
  return {
    finishedAt: run.finishedAt,
    id: run.runId,
    kind: "delete_expired_messages",
    startedAt: run.startedAt,
    status: run.status,
    summary:
      run.skippedReason ?
        `削除 ${run.deletedCount}件 / 保護 ${run.protectedCount}件 / ${run.skippedReason}` :
        `削除 ${run.deletedCount}件 / 保護 ${run.protectedCount}件`,
  };
}

function toSendHistoryItem(run: SendRunView): CronHistoryItemView {
  return {
    finishedAt: run.finishedAt,
    id: run.runId,
    kind: "send_daily_message",
    startedAt: run.startedAt,
    status: run.status,
    summary: `成功 ${run.successCount}件 / 失敗 ${run.failedCount}件 / 対象 ${run.targetCount}件`,
  };
}

function toReminderHistoryItem(run: ConfirmationReminderRunView): CronHistoryItemView {
  return {
    confirmedCount: run.confirmedCount,
    confirmedTargets: run.confirmedTargets,
    finishedAt: run.finishedAt,
    id: run.runId,
    kind: "check_unconfirmed_messages",
    startedAt: run.startedAt,
    status: run.status,
    summary:
      run.skippedReason ?
        `確認済 ${run.confirmedCount}件 / 未確認 ${run.unconfirmedCount}件 / 通知 ${run.notifiedCount}件 / ${run.skippedReason}` :
        `確認済 ${run.confirmedCount}件 / 未確認 ${run.unconfirmedCount}件 / 通知 ${run.notifiedCount}件 / 失敗 ${run.failedCount}件`,
    unconfirmedCount: run.unconfirmedCount,
    unconfirmedTargets: run.unconfirmedTargets,
  };
}

function normalizeLimit(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    return 50;
  }

  return Math.min(value, 100);
}
