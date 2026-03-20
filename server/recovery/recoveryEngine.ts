import { emitEvent } from "../controlTower/eventBus";
import { getAllBreakerStates } from "../utils/circuitBreaker";
import { getMetrics } from "../monitoring/metricsStore";
import { getQueueStats } from "../queue/patientQueue";
import { isUsingFallback } from "../redis/redisClient";
import { dbHealthCheck } from "../db/dbRouter";

export interface RecoveryAction {
  trigger: string;
  action: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "db" | "redis" | "openai" | "queue" | "scaling" | "routing";
}

export async function runRecovery(): Promise<RecoveryAction[]> {
  const actions: RecoveryAction[] = [];

  const [breakers, metrics, queueStats, dbHealth] = await Promise.all([
    Promise.resolve(getAllBreakerStates()),
    Promise.resolve(getMetrics()),
    Promise.resolve(getQueueStats()),
    dbHealthCheck(),
  ]);

  const redisFallback = isUsingFallback();
  const queueDepth = queueStats?.queueDepth ?? queueStats?.pending ?? 0;

  if (breakers["openai"] === "OPEN") {
    actions.push({
      trigger: "OpenAI circuit breaker OPEN",
      action: "Switch to fallback model — safe template responses activated",
      severity: "HIGH",
      category: "openai",
    });
  }

  if (queueDepth > 800) {
    actions.push({
      trigger: `Queue depth critical (${queueDepth}/1000)`,
      action: "Enable backpressure — throttle new intake, shed non-critical jobs",
      severity: "HIGH",
      category: "queue",
    });
  } else if (queueDepth > 500) {
    actions.push({
      trigger: `Queue depth elevated (${queueDepth}/1000)`,
      action: "Increase autonomy threshold to 0.95 — reduce physician review backlog",
      severity: "MEDIUM",
      category: "queue",
    });
  }

  if (metrics.errorRate > 0.2) {
    actions.push({
      trigger: `Error rate critical (${(metrics.errorRate * 100).toFixed(1)}%)`,
      action: "Scale up pods — signal K8s HPA to increase replica count immediately",
      severity: "CRITICAL",
      category: "scaling",
    });
  } else if (metrics.errorRate > 0.1) {
    actions.push({
      trigger: `Error rate elevated (${(metrics.errorRate * 100).toFixed(1)}%)`,
      action: "Pause non-critical background jobs — reserve capacity for clinical pipeline",
      severity: "HIGH",
      category: "scaling",
    });
  }

  if (redisFallback) {
    actions.push({
      trigger: "Redis primary unreachable",
      action: "Switch to in-memory queue — distributed locks falling back to in-process",
      severity: "MEDIUM",
      category: "redis",
    });
  }

  if (!dbHealth.ok) {
    actions.push({
      trigger: "Database unreachable",
      action: "Switch to read-only mode — cache existing sessions, block new writes",
      severity: "CRITICAL",
      category: "db",
    });
  } else if (dbHealth.latencyMs > 3000) {
    actions.push({
      trigger: `DB latency critical (${dbHealth.latencyMs}ms)`,
      action: "Enable query timeout guards — reject long-running queries above 5s",
      severity: "HIGH",
      category: "db",
    });
  }

  if (breakers["database"] === "OPEN") {
    actions.push({
      trigger: "Database circuit breaker OPEN",
      action: "Route to read replica — write operations queued for recovery",
      severity: "CRITICAL",
      category: "db",
    });
  }

  if (metrics.p95Latency > 4000) {
    actions.push({
      trigger: `P95 latency spike (${metrics.p95Latency}ms)`,
      action: "Activate async audit mode — drop non-critical sync work from hot path",
      severity: "HIGH",
      category: "scaling",
    });
  }

  if (actions.length > 0) {
    emitEvent({
      type: "SELF_HEAL_ACTIONS",
      payload: {
        count: actions.length,
        critical: actions.filter((a) => a.severity === "CRITICAL").length,
        actions: actions.map((a) => ({ trigger: a.trigger, action: a.action, severity: a.severity })),
        evaluatedAt: new Date().toISOString(),
      },
      timestamp: Date.now(),
    });

    const hasCritical = actions.some((a) => a.severity === "CRITICAL");
    if (hasCritical) {
      emitEvent({
        type: "SYSTEM_FAILURE",
        payload: {
          sources: actions.filter((a) => a.severity === "CRITICAL").map((a) => a.category),
          actionCount: actions.length,
        },
        timestamp: Date.now(),
      });
    }
  }

  return actions;
}
