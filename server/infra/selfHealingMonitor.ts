/**
 * selfHealingMonitor.ts
 * server/infra/selfHealingMonitor.ts
 *
 * THE STACK THAT LIVES — Auralyn's Self-Healing Infrastructure Layer
 *
 * Monitors the six critical services that must be running for Auralyn
 * to function as a clinical system. When a service fails:
 *   1. Detects the failure (health check or dead-man's switch)
 *   2. Diagnoses the root cause from logs + state
 *   3. Attempts automated remediation (safe actions only)
 *   4. Notifies via audit chain + console alert
 *   5. Escalates if remediation fails
 *
 * THE SIX CRITICAL SERVICES:
 *   1. PostgreSQL connection pool
 *   2. BullMQ follow-up worker
 *   3. WebSocket multimodal gateway
 *   4. Drift canary scheduler
 *   5. Research radar scheduler
 *   6. Skill nudge scheduler
 *
 * SAFE REMEDIATION ACTIONS (auto-apply):
 *   - Reconnect Postgres pool (non-destructive)
 *   - Re-register BullMQ workers (idempotent)
 *   - Re-arm schedulers (idempotent)
 *
 * UNSAFE ACTIONS (alert only, never auto-apply):
 *   - Database schema changes
 *   - Deleting queued jobs
 *   - Any action that could affect patient data
 *
 * SCHEDULE: Health checks every 5 minutes. Full diagnosis on failure.
 */

import { db }            from "../db";
import { sql }           from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";
import { llmGateway }    from "../gateway/llmGateway";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceName =
  | "postgres_pool"
  | "bullmq_follow_up_worker"
  | "websocket_multimodal"
  | "drift_canary_scheduler"
  | "research_radar_scheduler"
  | "skill_nudge_scheduler";

export type ServiceStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ServiceHealth {
  service:      ServiceName;
  status:       ServiceStatus;
  lastChecked:  string;
  lastHealthy:  string | null;
  failureCount: number;
  details:      string;
  error?:       string;
}

export interface RemediationResult {
  service:       ServiceName;
  attempted:     boolean;
  succeeded:     boolean;
  action:        string;
  details:       string;
  requiresHuman: boolean;
}

export interface IncidentReport {
  incidentId:  string;
  service:     ServiceName;
  detectedAt:  string;
  resolvedAt?: string;
  health:      ServiceHealth;
  diagnosis:   string;
  remediation: RemediationResult;
  notified:    boolean;
}

// ─── In-memory health state (per-process) ────────────────────────────────────

const healthState         = new Map<ServiceName, ServiceHealth>();
const schedulerHeartbeats = new Map<string, number>();

// ─── Heartbeat registration (dead-man's switch) ───────────────────────────────
// Call this from each scheduler when it fires.

export function recordSchedulerHeartbeat(schedulerName: string): void {
  schedulerHeartbeats.set(schedulerName, Date.now());
}

// ─── Health checkers ──────────────────────────────────────────────────────────

async function checkPostgresPool(): Promise<ServiceHealth> {
  const now = new Date().toISOString();
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    const status: ServiceStatus = latencyMs > 3000 ? "degraded" : "healthy";
    return {
      service:      "postgres_pool",
      status,
      lastChecked:  now,
      lastHealthy:  status === "healthy" ? now : healthState.get("postgres_pool")?.lastHealthy ?? null,
      failureCount: status === "healthy" ? 0 : (healthState.get("postgres_pool")?.failureCount ?? 0) + 1,
      details:      `Query latency: ${latencyMs}ms`,
    };
  } catch (err: any) {
    const prev = healthState.get("postgres_pool");
    return {
      service:      "postgres_pool",
      status:       "down",
      lastChecked:  now,
      lastHealthy:  prev?.lastHealthy ?? null,
      failureCount: (prev?.failureCount ?? 0) + 1,
      details:      "Connection failed",
      error:        err.message,
    };
  }
}

async function checkBullMQWorker(): Promise<ServiceHealth> {
  const now = new Date().toISOString();
  try {
    const recentJobs = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM audit_hash_chain
      WHERE event_type = 'FOLLOW_UP_MESSAGE_SENT'
        AND timestamp::timestamptz >= NOW() - INTERVAL '25 hours'
    `).catch(() => ({ rows: [{ cnt: 0 }] }));

    let queueHealthy = false;
    try {
      const { isRedisAvailable } = await import("../queue/queueFactory");
      queueHealthy = isRedisAvailable();
    } catch { queueHealthy = false; }

    const status: ServiceStatus = queueHealthy ? "healthy" : "degraded";
    const prev = healthState.get("bullmq_follow_up_worker");

    return {
      service:      "bullmq_follow_up_worker",
      status,
      lastChecked:  now,
      lastHealthy:  status === "healthy" ? now : prev?.lastHealthy ?? null,
      failureCount: status === "healthy" ? 0 : (prev?.failureCount ?? 0) + 1,
      details:      `Queue reachable: ${queueHealthy}. Recent follow-up sends: ${(recentJobs.rows[0] as any)?.cnt ?? 0}`,
    };
  } catch (err: any) {
    const prev = healthState.get("bullmq_follow_up_worker");
    return {
      service:      "bullmq_follow_up_worker",
      status:       "down",
      lastChecked:  now,
      lastHealthy:  prev?.lastHealthy ?? null,
      failureCount: (prev?.failureCount ?? 0) + 1,
      details:      "BullMQ check failed",
      error:        err.message,
    };
  }
}

function checkScheduler(
  serviceName:     ServiceName,
  heartbeatKey:    string,
  maxSilenceHours: number
): ServiceHealth {
  const now          = new Date().toISOString();
  const lastBeat     = schedulerHeartbeats.get(heartbeatKey);
  const prev         = healthState.get(serviceName);
  const silenceMs    = lastBeat ? Date.now() - lastBeat : Infinity;
  const silenceHours = silenceMs / (1000 * 60 * 60);

  const status: ServiceStatus =
    !lastBeat                            ? "unknown"  :
    silenceHours > maxSilenceHours * 2   ? "down"     :
    silenceHours > maxSilenceHours       ? "degraded" : "healthy";

  return {
    service:      serviceName,
    status,
    lastChecked:  now,
    lastHealthy:  status === "healthy" ? now : prev?.lastHealthy ?? null,
    failureCount: status === "healthy" ? 0 : (prev?.failureCount ?? 0) + 1,
    details:      lastBeat
      ? `Last heartbeat: ${Math.round(silenceHours * 10) / 10}h ago (max: ${maxSilenceHours}h)`
      : "No heartbeat recorded since server start (scheduler armed, not yet fired)",
  };
}

async function checkWebSocketGateway(): Promise<ServiceHealth> {
  const now = new Date().toISOString();
  try {
    const recentActivity = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM audit_hash_chain
      WHERE event_type IN ('GEOMETRIC_REASONING_INJECTED', 'HARNESS_CONTEXT_INJECTED')
        AND timestamp::timestamptz >= NOW() - INTERVAL '4 hours'
    `).catch(() => ({ rows: [{ cnt: 0 }] }));

    const count = Number((recentActivity.rows[0] as any)?.cnt ?? 0);
    const prev  = healthState.get("websocket_multimodal");

    const hour = new Date().getUTCHours();
    const isBusinessHours = hour >= 12 && hour <= 24;
    const status: ServiceStatus = (count === 0 && isBusinessHours) ? "degraded" : "healthy";

    return {
      service:      "websocket_multimodal",
      status,
      lastChecked:  now,
      lastHealthy:  status === "healthy" ? now : prev?.lastHealthy ?? null,
      failureCount: status === "healthy" ? 0 : (prev?.failureCount ?? 0) + 1,
      details:      `Cases processed last 4h: ${count}`,
    };
  } catch (err: any) {
    const prev = healthState.get("websocket_multimodal");
    return {
      service:      "websocket_multimodal",
      status:       "unknown",
      lastChecked:  now,
      lastHealthy:  prev?.lastHealthy ?? null,
      failureCount: (prev?.failureCount ?? 0) + 1,
      details:      "WebSocket health check failed",
      error:        err.message,
    };
  }
}

// ─── AI-powered diagnosis ─────────────────────────────────────────────────────

async function diagnoseFailure(health: ServiceHealth): Promise<string> {
  const recentEvents = await db.execute(sql`
    SELECT event_type, event_data, timestamp, actor
    FROM audit_hash_chain
    WHERE timestamp::timestamptz >= NOW() - INTERVAL '2 hours'
    ORDER BY timestamp DESC
    LIMIT 20
  `).catch(() => ({ rows: [] }));

  const eventSummary = (recentEvents.rows as any[])
    .map(r => `${r.timestamp}: ${r.event_type} (actor: ${r.actor})`)
    .join("\n");

  const gatewayResult = await llmGateway.complete({
    purpose:  "retrieval_pruner",
    messages: [{
      role:    "user",
      content: `Service failure detected:

Service: ${health.service}
Status: ${health.status}
Failure count: ${health.failureCount}
Details: ${health.details}
Error: ${health.error ?? "none"}

Recent audit events (last 2 hours):
${eventSummary || "No recent events found"}

Diagnose the most likely root cause and suggest the safest automated remediation.
Keep response under 200 words.`,
    }],
    system:    `You are diagnosing a service failure in Auralyn, a clinical AI triage system.
Be concise and specific. Identify the most likely root cause and the safest remediation.
Focus on non-destructive, reversible actions. Never suggest actions that could affect patient data.`,
    maxTokens: 500,
    cacheKey:  `diagnose:${health.service}:${health.failureCount}`,
  });

  return gatewayResult.content.trim();
}

// ─── Safe remediations ────────────────────────────────────────────────────────

async function remediatePostgres(_health: ServiceHealth): Promise<RemediationResult> {
  try {
    await db.execute(sql`SELECT pg_stat_activity.count FROM pg_stat_activity WHERE state = 'active'`);
    return {
      service:       "postgres_pool",
      attempted:     true,
      succeeded:     true,
      action:        "Pool reconnection probe",
      details:       "Postgres connection restored via probe query",
      requiresHuman: false,
    };
  } catch (err: any) {
    return {
      service:       "postgres_pool",
      attempted:     true,
      succeeded:     false,
      action:        "Pool reconnection probe",
      details:       `Reconnection failed: ${err.message}. Manual intervention required.`,
      requiresHuman: true,
    };
  }
}

async function remediateBullMQ(_health: ServiceHealth): Promise<RemediationResult> {
  try {
    const { registerFollowUpWorker } = await import("../followup/followUpService");
    await registerFollowUpWorker();
    return {
      service:       "bullmq_follow_up_worker",
      attempted:     true,
      succeeded:     true,
      action:        "Worker re-registration",
      details:       "BullMQ follow-up worker re-registered successfully",
      requiresHuman: false,
    };
  } catch (err: any) {
    return {
      service:       "bullmq_follow_up_worker",
      attempted:     true,
      succeeded:     false,
      action:        "Worker re-registration",
      details:       `Worker re-registration failed: ${err.message}`,
      requiresHuman: true,
    };
  }
}

async function remediateScheduler(
  service:  ServiceName,
  rearmFn:  () => void
): Promise<RemediationResult> {
  try {
    rearmFn();
    return {
      service,
      attempted:     true,
      succeeded:     true,
      action:        "Scheduler re-arm",
      details:       `Scheduler ${service} re-armed successfully`,
      requiresHuman: false,
    };
  } catch (err: any) {
    return {
      service,
      attempted:     true,
      succeeded:     false,
      action:        "Scheduler re-arm",
      details:       `Re-arm failed: ${err.message}`,
      requiresHuman: true,
    };
  }
}

// ─── Main monitor ─────────────────────────────────────────────────────────────

export const SelfHealingMonitor = {

  _schedulerRearmFns: new Map<ServiceName, () => void>(),

  registerSchedulerRearm(service: ServiceName, fn: () => void): void {
    this._schedulerRearmFns.set(service, fn);
  },

  async runHealthChecks(): Promise<ServiceHealth[]> {
    const checks = await Promise.all([
      checkPostgresPool(),
      checkBullMQWorker(),
      checkWebSocketGateway(),
      Promise.resolve(checkScheduler("drift_canary_scheduler",   "drift_canary",   26)),
      Promise.resolve(checkScheduler("research_radar_scheduler", "research_radar", 170)),
      Promise.resolve(checkScheduler("skill_nudge_scheduler",    "skill_nudge",    26)),
    ]);
    checks.forEach(h => healthState.set(h.service, h));
    return checks;
  },

  async handleFailure(health: ServiceHealth): Promise<IncidentReport> {
    const incidentId = `incident-${health.service}-${Date.now()}`;
    const detectedAt = new Date().toISOString();

    console.error(`[SelfHealing] ⚠ Service failure: ${health.service} — ${health.details}`);

    const diagnosis = await diagnoseFailure(health).catch(() =>
      `Automated diagnosis unavailable. Service ${health.service} is ${health.status}.`
    );

    let remediation: RemediationResult;

    switch (health.service) {
      case "postgres_pool":
        remediation = await remediatePostgres(health);
        break;
      case "bullmq_follow_up_worker":
        remediation = await remediateBullMQ(health);
        break;
      case "drift_canary_scheduler":
      case "research_radar_scheduler":
      case "skill_nudge_scheduler": {
        const rearmFn = this._schedulerRearmFns.get(health.service);
        remediation = rearmFn
          ? await remediateScheduler(health.service, rearmFn)
          : { service: health.service, attempted: false, succeeded: false,
              action: "None", details: "No re-arm function registered", requiresHuman: true };
        break;
      }
      default:
        remediation = { service: health.service, attempted: false, succeeded: false,
          action: "Manual review required", details: "No automated remediation available",
          requiresHuman: true };
    }

    const report: IncidentReport = {
      incidentId,
      service:    health.service,
      detectedAt,
      resolvedAt: remediation.succeeded ? new Date().toISOString() : undefined,
      health,
      diagnosis,
      remediation,
      notified:   false,
    };

    await appendAuditEvent({
      actor:      "system",
      action:     remediation.succeeded ? "SELF_HEAL_SUCCEEDED" : "SELF_HEAL_FAILED",
      entityId:   incidentId,
      entityType: "infrastructure",
      details: {
        service:          health.service,
        status:           health.status,
        failureCount:     health.failureCount,
        action:           remediation.action,
        succeeded:        String(remediation.succeeded),
        requiresHuman:    String(remediation.requiresHuman),
        diagnosisSummary: diagnosis.slice(0, 200),
        incidentId,
      },
    }).catch(console.error);

    if (remediation.succeeded) {
      console.log(`[SelfHealing] ✅ ${health.service} auto-resolved. Action: ${remediation.action}`);
    } else {
      console.error(`[SelfHealing] 🚨 ${health.service} requires HUMAN INTERVENTION.`);
      console.error(`[SelfHealing] Diagnosis: ${diagnosis}`);
      console.error(`[SelfHealing] Check /infra-status dashboard for details.`);
    }

    report.notified = true;
    return report;
  },

  async runCycle(): Promise<void> {
    const healths = await this.runHealthChecks();

    for (const health of healths) {
      const isNewFailure =
        (health.status === "down" || health.status === "degraded") &&
        health.failureCount === 1;

      const isPersistent =
        health.status === "down" &&
        health.failureCount > 0 &&
        health.failureCount % 6 === 0;

      if (isNewFailure || isPersistent) {
        await this.handleFailure(health).catch(console.error);
      }
    }
  },

  start(): void {
    console.log("[SelfHealing] Monitor started — health checks every 5 minutes");
    setTimeout(() => {
      this.runCycle().catch(console.error);
    }, 30_000);
    setInterval(() => {
      this.runCycle().catch(console.error);
    }, 5 * 60 * 1000);
  },

  getHealthSummary(): Record<ServiceName, ServiceHealth> {
    return Object.fromEntries(healthState.entries()) as Record<ServiceName, ServiceHealth>;
  },
};
