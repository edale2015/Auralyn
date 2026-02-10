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

export function checkRunBudget(runId: string, config?: Partial<LlmGuardrailConfig>, channel?: string): {
  allowed: boolean;
  reason?: string;
  budget: RunBudget;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const budget = runBudgets.get(runId) ?? { calls: 0, tokensIn: 0, tokensOut: 0 };

  if (budget.calls >= cfg.maxCallsPerRun) {
    if (channel) {
      try {
        const { getChannelOpsTracker } = require("../../channels/channelOps");
        getChannelOpsTracker().recordLLMEvent({ channel, type: "budget_exceeded" });
      } catch {}
    }
    return {
      allowed: false,
      reason: `Max LLM calls per run exceeded (${budget.calls}/${cfg.maxCallsPerRun})`,
      budget,
    };
  }

  const totalTokens = budget.tokensIn + budget.tokensOut;
  if (totalTokens >= cfg.maxTokensPerRun) {
    if (channel) {
      try {
        const { getChannelOpsTracker } = require("../../channels/channelOps");
        getChannelOpsTracker().recordLLMEvent({ channel, type: "budget_exceeded" });
      } catch {}
    }
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
    try {
      const { getChannelOpsTracker } = require("../../channels/channelOps");
      for (const ch of ["whatsapp", "telegram", "web"] as const) {
        getChannelOpsTracker().setCooldownActive(ch, false);
      }
    } catch {}
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
    recordCircuitBreakerTrigger();
    try {
      const { getChannelOpsTracker } = require("../../channels/channelOps");
      for (const ch of ["whatsapp", "telegram", "web"] as const) {
        getChannelOpsTracker().recordLLMEvent({ channel: ch, type: "circuit_breaker_trip" });
        getChannelOpsTracker().setCooldownActive(ch, true);
      }
    } catch {}
  }
}

export function recordCircuitSuccess() {
  // no-op for now; half-open probing can be added later
}

const circuitBreakerTriggers: number[] = [];

export function recordCircuitBreakerTrigger() {
  circuitBreakerTriggers.push(Date.now());
  if (circuitBreakerTriggers.length > 1000) {
    circuitBreakerTriggers.splice(0, circuitBreakerTriggers.length - 500);
  }
}

export function getCircuitBreakerTriggersToday(): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  return circuitBreakerTriggers.filter(t => t >= cutoff).length;
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
