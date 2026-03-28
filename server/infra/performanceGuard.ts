export interface TimedResult<T> {
  result: T;
  durationMs: number;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 2000;
let totalCalls = 0;
let timeoutCount = 0;

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  fallback?: T,
): Promise<TimedResult<T>> {
  totalCalls++;
  const start = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms),
  );

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return { result, durationMs: Date.now() - start, timedOut: false };
  } catch (err: any) {
    if (err?.message?.startsWith("timeout_")) {
      timeoutCount++;
      if (fallback !== undefined) {
        return { result: fallback, durationMs: ms, timedOut: true };
      }
    }
    throw err;
  }
}

export async function timedExec<T>(
  fn: () => Promise<T>,
  label: string = "operation",
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<TimedResult<T> & { label: string }> {
  const timed = await withTimeout(fn(), ms);
  if (timed.timedOut) {
    console.warn(`[performanceGuard] ${label} exceeded ${ms}ms`);
  }
  return { ...timed, label };
}

export function getPerformanceStats() {
  return {
    active: true,
    totalCalls,
    timeoutCount,
    timeoutRate: totalCalls > 0 ? +(timeoutCount / totalCalls).toFixed(4) : 0,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  };
}
