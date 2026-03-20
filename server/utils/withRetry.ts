export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 300
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries === 0) throw e;
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  retries = 2
): Promise<T> {
  try {
    return await withRetry(fn, retries);
  } catch {
    return fallback;
  }
}
