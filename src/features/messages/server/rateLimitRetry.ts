const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const RETRY_AFTER_SECONDS_MULTIPLIER = 1000;

type FetchWithRateLimitRetryInit = RequestInit & {
  maxRetries?: number;
  retryDelayMs?: number;
};

export async function fetchWithRateLimitRetry(input: RequestInfo | URL, init: FetchWithRateLimitRetryInit = {}) {
  const { maxRetries = DEFAULT_MAX_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS, ...fetchInit } = init;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(input, fetchInit);

    if (response.status !== 429 || attempt === maxRetries) {
      return response;
    }

    await wait(resolveRetryDelayMs(response.headers.get("retry-after"), retryDelayMs, attempt));
  }

  throw new Error("Rate limit retry failed unexpectedly.");
}

export function resolveRetryDelayMs(retryAfter: null | string, retryDelayMs: number, attempt: number) {
  const trimmedRetryAfter = retryAfter?.trim();

  if (trimmedRetryAfter) {
    const retryAfterSeconds = Number(trimmedRetryAfter);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * RETRY_AFTER_SECONDS_MULTIPLIER;
    }

    const retryAfterDate = Date.parse(trimmedRetryAfter);

    if (!Number.isNaN(retryAfterDate)) {
      return Math.max(0, retryAfterDate - Date.now());
    }
  }

  return retryDelayMs * 2 ** attempt;
}

function wait(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
