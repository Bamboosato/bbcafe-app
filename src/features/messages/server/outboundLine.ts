import { fetchWithRateLimitRetry } from "./rateLimitRetry";

export type LinePushResult = {
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
      ok: response.ok,
      status: response.status,
      userId,
    });
  }

  return results;
}
