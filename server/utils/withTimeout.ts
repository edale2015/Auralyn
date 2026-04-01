/**
 * Circuit breaker + timeout utility.
 * Resolves with `fallback` if `fn` takes longer than `ms` or throws.
 * Guarantees no silent hang — every async call gets a hard deadline.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

/**
 * Same as withTimeout but rejects instead of returning a fallback.
 * Use when you need to surface timeout errors to the caller.
 */
export async function withTimeoutStrict<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    fn()
      .then((r) => { clearTimeout(timer); resolve(r); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}
