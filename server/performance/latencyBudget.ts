export interface BudgetResult {
  degrade: boolean;
  elapsed: number;
  budget:  number;
  reason?: string;
}

export function enforceLatencyBudget(startMs: number, budgetMs = 1500): BudgetResult {
  const elapsed = Date.now() - startMs;
  if (elapsed > budgetMs) {
    return { degrade: true, elapsed, budget: budgetMs, reason: "latency_budget_exceeded" };
  }
  return { degrade: false, elapsed, budget: budgetMs };
}

export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 200 } = options;
  let lastErr: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 100;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastErr;
}

export function timeoutRace<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}
