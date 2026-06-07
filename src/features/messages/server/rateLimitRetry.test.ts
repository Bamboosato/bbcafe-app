import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRateLimitRetry, resolveRetryDelayMs } from "./rateLimitRetry";

describe("rate limit retry helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries 429 responses and returns the first non-rate-limited response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchWithRateLimitRetry("https://example.com/api", { retryDelayMs: 0 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying after the configured retry count", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("rate limited", { status: 429 }));

    const response = await fetchWithRateLimitRetry("https://example.com/api", {
      maxRetries: 1,
      retryDelayMs: 0,
    });

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses Retry-After seconds before falling back to exponential backoff", () => {
    expect(resolveRetryDelayMs("3", 1000, 0)).toBe(3000);
    expect(resolveRetryDelayMs(null, 1000, 2)).toBe(4000);
  });
});
