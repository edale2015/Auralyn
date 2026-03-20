import { emitEvent } from "../controlTower/eventBus";
import { getAllBreakerStates } from "../utils/circuitBreaker";
import { getQueueStats } from "../queue/patientQueue";
import { getMetrics } from "../monitoring/metricsStore";

export interface SelfHealAction {
  issue: string;
  action: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  triggeredAt: string;
}

let lastHealAt: Record<string, number> = {};
const HEAL_COOLDOWN_MS = 120_000;

function shouldHeal(key: string): boolean {
  const now = Date.now();
  if (!lastHealAt[key] || now - lastHealAt[key] > HEAL_COOLDOWN_MS) {
    lastHealAt[key] = now;
    return true;
  }
  return false;
}

function emit(action: SelfHealAction) {
  emitEvent({
    type: "SELF_HEAL",
    payload: action,
    timestamp: Date.now(),
  });
  console.log(`[SelfHeal] ${action.issue} → ${action.action}`);
}

export async function runSelfHealing(): Promise<SelfHealAction[]> {
  const actions: SelfHealAction[] = [];
  const breakers = getAllBreakerStates();
  const metrics = getMetrics() as any;
  const queueStats = getQueueStats();

  if (breakers["openai"] === "OPEN" && shouldHeal("openai_open")) {
    const a: SelfHealAction = {
      issue: "OpenAI circuit breaker OPEN",
      action: "Activating fallback degradation mode — all responses will use safe fallback templates until OpenAI recovers",
      severity: "HIGH",
      triggeredAt: new Date().toISOString(),
    };
    emit(a);
    actions.push(a);
  }

  if (breakers["database"] === "OPEN" && shouldHeal("db_open")) {
    const a: SelfHealAction = {
      issue: "Database circuit breaker OPEN",
      action: "Switching to in-memory session cache — new writes paused, reads from cache only",
      severity: "HIGH",
      triggeredAt: new Date().toISOString(),
    };
    emit(a);
    actions.push(a);
  }

  if (breakers["twilio"] === "OPEN" && shouldHeal("twilio_open")) {
    const a: SelfHealAction = {
      issue: "Twilio circuit breaker OPEN",
      action: "SMS/WhatsApp alerts suppressed — patients will be flagged for physician follow-up instead",
      severity: "MEDIUM",
      triggeredAt: new Date().toISOString(),
    };
    emit(a);
    actions.push(a);
  }

  if (queueStats.pending > 900 && shouldHeal("queue_high")) {
    const a: SelfHealAction = {
      issue: `Patient queue near capacity (${queueStats.pending}/1000)`,
      action: "New job intake throttled — returning 503 until queue drops below 700",
      severity: "HIGH",
      triggeredAt: new Date().toISOString(),
    };
    emit(a);
    actions.push(a);
  }

  if (metrics.errorRate > 0.25 && metrics.totalRequests > 50 && shouldHeal("high_error_rate")) {
    const a: SelfHealAction = {
      issue: `Error rate critically high (${(metrics.errorRate * 100).toFixed(1)}%)`,
      action: "Non-critical background jobs paused — resources reserved for clinical pipeline",
      severity: "HIGH",
      triggeredAt: new Date().toISOString(),
    };
    emit(a);
    actions.push(a);
  }

  if (metrics.p95Latency > 5000 && shouldHeal("high_latency")) {
    const a: SelfHealAction = {
      issue: `P95 latency critically high (${metrics.p95Latency}ms)`,
      action: "Explanation and audit steps set to async — core triage pipeline prioritized",
      severity: "MEDIUM",
      triggeredAt: new Date().toISOString(),
    };
    emit(a);
    actions.push(a);
  }

  return actions;
}

export function getLastHealTimes(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(lastHealAt).map(([k, ts]) => [k, new Date(ts).toISOString()])
  );
}

export function resetHealTimes(): void {
  lastHealAt = {};
}
