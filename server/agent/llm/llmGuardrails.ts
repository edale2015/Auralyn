export interface LlmGuardrailConfig {
  maxCallsPerRun: number;
  maxTokensPerRun: number;
  circuitBreakerThreshold: number;
  circuitBreakerWindowMs: number;
  circuitBreakerCooldownMs: number;
}

const DEFAULT_CONFIG: LlmGuardrailConfig = {
  maxCallsPerRun: 10,
  maxTokensPerRun: 4000,
  circuitBreakerThreshold: 5,
  circuitBreakerWindowMs: 60_000,
  circuitBreakerCooldownMs: 120_000,
};

interface RunBudget {
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

const runBudgets = new Map<string, RunBudget>();

let circuitErrors: number[] = [];
let circuitOpenUntil = 0;

export function getGuardrailConfig(): LlmGuardrailConfig {
  return { ...DEFAULT_CONFIG };
}

export function checkRunBudget(runId: string, config?: Partial<LlmGuardrailConfig>): {
  allowed: boolean;
  reason?: string;
  budget: RunBudget;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const budget = runBudgets.get(runId) ?? { calls: 0, tokensIn: 0, tokensOut: 0 };

  if (budget.calls >= cfg.maxCallsPerRun) {
    return {
      allowed: false,
      reason: `Max LLM calls per run exceeded (${budget.calls}/${cfg.maxCallsPerRun})`,
      budget,
    };
  }

  const totalTokens = budget.tokensIn + budget.tokensOut;
  if (totalTokens >= cfg.maxTokensPerRun) {
    return {
      allowed: false,
      reason: `Max tokens per run exceeded (${totalTokens}/${cfg.maxTokensPerRun})`,
      budget,
    };
  }

  return { allowed: true, budget };
}

export function recordLlmCall(runId: string, tokensIn: number, tokensOut: number) {
  const budget = runBudgets.get(runId) ?? { calls: 0, tokensIn: 0, tokensOut: 0 };
  budget.calls++;
  budget.tokensIn += tokensIn;
  budget.tokensOut += tokensOut;
  runBudgets.set(runId, budget);
}

export function clearRunBudget(runId: string) {
  runBudgets.delete(runId);
}

export function isCircuitOpen(): boolean {
  if (Date.now() < circuitOpenUntil) return true;
  if (circuitOpenUntil > 0 && Date.now() >= circuitOpenUntil) {
    circuitOpenUntil = 0;
    circuitErrors = [];
  }
  return false;
}

export function recordCircuitError(config?: Partial<LlmGuardrailConfig>) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  circuitErrors = circuitErrors.filter(t => now - t < cfg.circuitBreakerWindowMs);
  circuitErrors.push(now);

  if (circuitErrors.length >= cfg.circuitBreakerThreshold) {
    circuitOpenUntil = now + cfg.circuitBreakerCooldownMs;
    console.warn(`[LLM-CircuitBreaker] Circuit OPEN: ${circuitErrors.length} errors in ${cfg.circuitBreakerWindowMs}ms window. Cooldown until ${new Date(circuitOpenUntil).toISOString()}`);
    circuitErrors = [];
  }
}

export function recordCircuitSuccess() {
  // no-op for now; half-open probing can be added later
}

export function getCircuitStatus(): { open: boolean; errorCount: number; cooldownUntil: string | null } {
  const now = Date.now();
  const windowErrors = circuitErrors.filter(t => now - t < DEFAULT_CONFIG.circuitBreakerWindowMs);
  return {
    open: isCircuitOpen(),
    errorCount: windowErrors.length,
    cooldownUntil: circuitOpenUntil > now ? new Date(circuitOpenUntil).toISOString() : null,
  };
}

export function getRunBudgetStatus(runId: string): RunBudget & { remaining: { calls: number; tokens: number } } {
  const budget = runBudgets.get(runId) ?? { calls: 0, tokensIn: 0, tokensOut: 0 };
  return {
    ...budget,
    remaining: {
      calls: DEFAULT_CONFIG.maxCallsPerRun - budget.calls,
      tokens: DEFAULT_CONFIG.maxTokensPerRun - (budget.tokensIn + budget.tokensOut),
    },
  };
}
