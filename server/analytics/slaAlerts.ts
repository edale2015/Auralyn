import { getTraceStore, type StoredTrace } from "../traces/traceStore";
import { getLlmCallLog } from "../traces/llmCallLog";
import { getCircuitBreakerTriggersToday as getGuardrailTriggersToday } from "../agent/llm/llmGuardrails";

export interface SlaThresholds {
  p95LatencyMs: number;
  avgTokensPerRun: number;
  circuitBreakersPerDay: number;
  maxCostPerRunUsd: number;
}

const DEFAULT_THRESHOLDS: SlaThresholds = {
  p95LatencyMs: 15000,
  avgTokensPerRun: 2000,
  circuitBreakersPerDay: 3,
  maxCostPerRunUsd: 0.05,
};

export interface SlaAlert {
  type: "latency" | "tokens" | "circuit_breaker" | "cost";
  severity: "warning" | "critical";
  message: string;
  currentValue: number;
  threshold: number;
}

export interface SlaStatus {
  healthy: boolean;
  alerts: SlaAlert[];
  metrics: {
    p95LatencyMs: number;
    avgTokensPerRun: number;
    avgCostPerRunUsd: number;
    circuitBreakerTriggersToday: number;
    runsAnalyzed: number;
  };
  thresholds: SlaThresholds;
  checkedAt: string;
}

function getCircuitBreakerTriggersToday(): number {
  return getGuardrailTriggersToday();
}

export async function computeSlaStatus(thresholds?: Partial<SlaThresholds>): Promise<SlaStatus> {
  const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const alerts: SlaAlert[] = [];

  const traces = await getTraceStore().list({ limit: 100 });
  const recentTraces = traces.filter(t => {
    const age = Date.now() - new Date(t.createdAt).getTime();
    return age < 86400000;
  });

  const runsAnalyzed = recentTraces.length;

  let p95LatencyMs = 0;
  let avgTokensPerRun = 0;
  let avgCostPerRunUsd = 0;

  if (recentTraces.length > 0) {
    const latencies: number[] = [];
    const tokenCounts: number[] = [];
    const costs: number[] = [];

    for (const trace of recentTraces) {
      const logs = await getLlmCallLog().getByRunId(trace.runId, 100);
      const totalLatency = logs.reduce((s, l) => s + l.latencyMs, 0);
      const totalTokensIn = logs.reduce((s, l) => s + (l.tokensIn ?? 0), 0);
      const totalTokensOut = logs.reduce((s, l) => s + (l.tokensOut ?? 0), 0);
      const totalTokens = totalTokensIn + totalTokensOut;
      const cost = (totalTokensIn * 0.00015 + totalTokensOut * 0.0006) / 1000;

      latencies.push(totalLatency);
      tokenCounts.push(totalTokens);
      costs.push(cost);
    }

    latencies.sort((a, b) => a - b);
    const p95Idx = Math.ceil(latencies.length * 0.95) - 1;
    p95LatencyMs = latencies[Math.max(0, p95Idx)] ?? 0;

    avgTokensPerRun = tokenCounts.length > 0
      ? Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length)
      : 0;

    avgCostPerRunUsd = costs.length > 0
      ? Number((costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(6))
      : 0;
  }

  const cbTriggersToday = getCircuitBreakerTriggersToday();

  if (p95LatencyMs > cfg.p95LatencyMs) {
    alerts.push({
      type: "latency",
      severity: p95LatencyMs > cfg.p95LatencyMs * 2 ? "critical" : "warning",
      message: `P95 latency (${p95LatencyMs}ms) exceeds threshold (${cfg.p95LatencyMs}ms)`,
      currentValue: p95LatencyMs,
      threshold: cfg.p95LatencyMs,
    });
  }

  if (avgTokensPerRun > cfg.avgTokensPerRun) {
    alerts.push({
      type: "tokens",
      severity: avgTokensPerRun > cfg.avgTokensPerRun * 2 ? "critical" : "warning",
      message: `Avg tokens/run (${avgTokensPerRun}) exceeds threshold (${cfg.avgTokensPerRun})`,
      currentValue: avgTokensPerRun,
      threshold: cfg.avgTokensPerRun,
    });
  }

  if (cbTriggersToday > cfg.circuitBreakersPerDay) {
    alerts.push({
      type: "circuit_breaker",
      severity: "critical",
      message: `Circuit breaker triggered ${cbTriggersToday} times today (threshold: ${cfg.circuitBreakersPerDay})`,
      currentValue: cbTriggersToday,
      threshold: cfg.circuitBreakersPerDay,
    });
  }

  if (avgCostPerRunUsd > cfg.maxCostPerRunUsd) {
    alerts.push({
      type: "cost",
      severity: avgCostPerRunUsd > cfg.maxCostPerRunUsd * 2 ? "critical" : "warning",
      message: `Avg cost/run ($${avgCostPerRunUsd.toFixed(4)}) exceeds threshold ($${cfg.maxCostPerRunUsd})`,
      currentValue: avgCostPerRunUsd,
      threshold: cfg.maxCostPerRunUsd,
    });
  }

  return {
    healthy: alerts.length === 0,
    alerts,
    metrics: {
      p95LatencyMs,
      avgTokensPerRun,
      avgCostPerRunUsd,
      circuitBreakerTriggersToday: cbTriggersToday,
      runsAnalyzed,
    },
    thresholds: cfg,
    checkedAt: new Date().toISOString(),
  };
}
