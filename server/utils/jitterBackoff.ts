/**
 * Full Jitter Exponential Backoff (NeuroCore-style)
 *
 * Article: "Full jitter prevents thundering herd after shared API outages"
 * Formula: jitter = random.uniform(0, min(base × 2^attempt, max_delay))
 *
 * Why full jitter specifically:
 *   - Pure exponential: all retrying callers wake at the same time → server spike
 *   - "Equal jitter" (half exp + half random): still correlated
 *   - "Full jitter": each caller picks uniformly from [0, cap] → uncorrelated
 *
 * Clinical relevance:
 *   External APIs (FHIR endpoints, lab systems, imaging APIs) share rate limits.
 *   When a hospital lab system returns 429, all concurrent patient queries retry.
 *   Without full jitter, they hammer the system simultaneously — making it worse.
 */

export interface BackoffOptions {
  baseMs?:     number;    // default 1000ms
  maxMs?:      number;    // default 30000ms (30s)
  maxRetries?: number;    // default 5
  jitter?:     boolean;   // default true (full jitter); false = pure exponential
}

export interface RetryResult<T> {
  value:    T;
  attempts: number;
  totalMs:  number;
}

/** Compute the delay for a given attempt using full jitter */
export function computeBackoffMs(
  attempt: number,           // 0-indexed (first retry = attempt 1)
  opts:    BackoffOptions = {}
): number {
  const base   = opts.baseMs ?? 1000;
  const max    = opts.maxMs  ?? 30_000;
  const useJitter = opts.jitter !== false;

  const raw    = base * Math.pow(2, attempt);
  const capped = Math.min(raw, max);
  return useJitter ? Math.random() * capped : capped;
}

/** Retry an async fn with full jitter exponential backoff */
export async function withJitterRetry<T>(
  fn:        () => Promise<T>,
  opts:      BackoffOptions = {},
  onRetry?:  (attempt: number, delayMs: number, err: Error) => void
): Promise<RetryResult<T>> {
  const maxRetries = opts.maxRetries ?? 5;
  const start      = Date.now();
  let   lastErr!:  Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = computeBackoffMs(attempt - 1, opts);
      onRetry?.(attempt, delayMs, lastErr);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    try {
      const value = await fn();
      return { value, attempts: attempt + 1, totalMs: Date.now() - start };
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) throw lastErr;
    }
  }

  throw lastErr!;
}

/** Retry an array of promises independently — each gets its own backoff */
export async function withJitterRetryAll<T>(
  fns:   (() => Promise<T>)[],
  opts:  BackoffOptions = {}
): Promise<RetryResult<T>[]> {
  return Promise.all(fns.map((fn) => withJitterRetry(fn, opts)));
}

/** Sleep with optional jitter (useful for rate-limit windows) */
export async function jitterSleep(
  baseMs:  number,
  maxMs?:  number
): Promise<void> {
  const cap = maxMs ?? baseMs * 2;
  await new Promise((r) => setTimeout(r, Math.random() * Math.min(baseMs, cap)));
}
