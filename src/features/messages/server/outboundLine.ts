import { fetchWithRateLimitRetry } from "./rateLimitRetry";

export type LinePushResult = {
  errorCode?: string;
  ok: boolean;
  status: number;
  userId: string;
};

export async function sendLineTextMessages({
  channelAccessToken,
  text,
  userIds,
}: {
  channelAccessToken: string;
  text: string;
  userIds: string[];
}) {
  const results: LinePushResult[] = [];

  for (const userId of userIds) {
    try {
      const response = await fetchWithRateLimitRetry("https://api.line.me/v2/bot/message/push", {
        body: JSON.stringify({
          messages: [
            {
              text,
              type: "text",
            },
          ],
          to: userId,
        }),
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      results.push({
        ...(response.ok ? {} : { errorCode: `LINE_${response.status}` }),
        ok: response.ok,
        status: response.status,
        userId,
      });
    } catch {
      results.push({
        errorCode: "LINE_REQUEST_FAILED",
        ok: false,
        status: 0,
        userId,
      });
    }
  }

  return results;
}
