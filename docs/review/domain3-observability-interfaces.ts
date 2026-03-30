/**
 * ============================================================
 * DOMAIN 3: OBSERVABILITY & MONITORING — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/observability/clinicalSLOs.ts
 *   server/observability/engineHealthWrapper.ts
 *   server/phase7/phase7Health.ts
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. Are these 8 clinical SLOs the right set? What does Epic's
 *      ambulatory CDSS monitor that we're missing?
 *   2. Is the 25% per-engine circuit breaker threshold appropriate?
 *      Too sensitive? Too lenient?
 *   3. Is 24 hours the right rolling window for engine health metrics?
 *   4. Nuance DAX tracks specialty-stratified accuracy — should we
 *      add per-complaint-category SLOs?
 *   5. What should trigger the Phase 7 "critical" vs "degraded"
 *      status? Is outcome logger lag > 50% the right threshold?
 * ============================================================
 */


// ─── 3.1 · Clinical SLO Definitions ──────────────────────────────────────────

/**
 * Rec 3.2 — Standard software SLOs (p99 latency, error rate) are
 * insufficient for clinical AI. These 8 SLOs are outcome-based —
 * they measure the safety and accuracy of clinical decisions.
 */
export type SloBreachAction = "alert" | "circuit_break" | "halt_system";

export interface ClinicalSLO {
  id:               string;
  name:             string;
  description:      string;
  target:           number;
  unit:             "ratio" | "seconds" | "count";
  higherIsBetter:   boolean;          // true = must be above target; false = must be below
  breachAction:     SloBreachAction;
  fdaAuditRequired: boolean;
}

/**
 * The 8 clinical SLOs currently defined:
 *
 *  ID                          Target  Unit    HigherBetter  BreachAction    FDA?
 *  ──────────────────────────  ──────  ──────  ────────────  ──────────────  ────
 *  ER_NOW_SENSITIVITY          0.99    ratio   true          halt_system     yes
 *  ER_NOW_FALSE_POSITIVE_RATE  0.15    ratio   false         alert           yes
 *  INTAKE_COMPLETION_RATE      0.95    ratio   true          alert           no
 *  PHYSICIAN_REVIEW_LATENCY    300     seconds false         circuit_break   yes
 *  AGENT_CONSENSUS_RATE        0.80    ratio   true          alert           no
 *  DEMOGRAPHIC_PARITY_DELTA    0.05    ratio   false         alert           yes
 *  CONFIDENCE_FLOOR_VIOLATIONS 0.05    ratio   false         alert           yes
 *  HARD_STOP_BYPASS_RATE       0.02    ratio   false         alert           yes
 */
export declare const CLINICAL_SLOS: ClinicalSLO[];

export interface SLOStatus {
  slo:           ClinicalSLO;
  currentValue:  number | null;
  breached:      boolean;
  trend:         "improving" | "stable" | "degrading";   // over last 3 readings
  breachHistory: Array<{ at: string; value: number }>;   // last 50 breaches
  lastCheckedAt: string;
}

/**
 * Records a new value for a given SLO.
 * Automatically detects breach, fires emitEvent on halt_system breach,
 * and appends to breach history (capped at 50 entries).
 */
export declare function recordSLOValue(sloId: string, value: number): void;

/** Returns current status for all 8 SLOs including trend and breach history. */
export declare function getSLOStatuses(): SLOStatus[];


// ─── 3.2 · Universal Engine Health Wrapper ───────────────────────────────────

/**
 * Rec 3.1 — Abstract base class that every clinical engine extends.
 * Automatically tracks: invocations, error rate, p50/p95/p99 latency,
 * input validation failures, output schema violations, disposition
 * distribution, and red flag detection rate.
 *
 * Agent addition: per-engine circuit breaker trips at 25% error rate.
 *
 * With 70 discovered engine files, this gives the Control Tower a uniform
 * surface to query health across the entire engine fleet.
 */
export interface EngineHealthMetrics {
  engineId:                   string;
  engineVersion:              string;
  lastInvocationAt?:          string;
  invocationCount24h:         number;   // rolling 24h window
  errorRate24h:               number;   // 0–1, rolling 24h window
  p50LatencyMs:               number;
  p95LatencyMs:               number;
  p99LatencyMs:               number;
  lastErrorMessage?:          string;
  inputValidationFailureRate: number;   // 0–1
  outputSchemaViolationRate:  number;   // 0–1
  circuitBreakerOpen:         boolean;  // trips at 25% error rate (agent addition)
  circuitBreakerOpenedAt?:    string;
  dispositionDistribution:    Record<string, number>;   // proportion per disposition tier
  redFlagDetectionRate:       number;   // proportion of invocations that returned red flags
}

/**
 * Abstract base class — all engines must extend this.
 * Implementors provide engineId, engineVersion, validateInput, validateOutput.
 * All invocations go through the protected invoke() wrapper — never directly.
 */
export declare abstract class MonitoredClinicalEngine<TInput = unknown, TOutput = unknown> {
  abstract readonly engineId:      string;
  abstract readonly engineVersion: string;

  protected abstract validateInput(input: TInput): void;
  protected abstract validateOutput(output: TOutput): void;

  /** Wraps handler call with telemetry, validation, and circuit breaker. */
  protected invoke<I extends TInput, O extends TOutput>(
    input:   I,
    handler: (input: I) => Promise<O>
  ): Promise<O>;

  /** Call inside engine implementations when a disposition is produced. */
  protected recordDisposition(disposition: string): void;

  /** Call inside engine implementations when a red flag is detected. */
  protected recordRedFlag(): void;

  /** Manually reset this engine's circuit breaker after investigation. */
  resetCircuitBreaker(): void;

  /** Returns the full health metrics snapshot for this engine. */
  getHealthMetrics(): EngineHealthMetrics;
}

/** Returns all self-registered engine instances and their health metrics. */
export declare function getEngineRegistry(): Map<string, MonitoredClinicalEngine>;
export declare function getAllEngineHealthMetrics(): EngineHealthMetrics[];


// ─── 3.3 · Phase 7 Learning Loop Health Endpoint ─────────────────────────────

/**
 * Rec 3.3 — Full health response for the Continuous Learning phase.
 * Aggregates: learning loop status, drift state, agent weight state,
 * RLHF pipeline status, SLO summary, and active alerts.
 *
 * Agent addition: outcomeLoggerLagPct measures how far behind outcome
 * logging is relative to new cases being processed.
 */
export interface Phase7HealthResponse {
  status:     "healthy" | "degraded" | "critical";
  timestamp:  string;

  learningLoop: {
    isRunning:             boolean;
    lastRunAt:             string | null;
    lastRunDurationMs:     number | null;
    casesProcessedLast24h: number;
    outcomeLoggerLagPct:   number;   // 0 = perfect, 1 = no outcomes logged at all
  };

  driftState: {
    currentDriftScore:         number;     // 0–1
    circuitBreakerStatus:      "closed" | "open";   // legacy drift control
    safeDriftCircuitStatus:    "CLOSED" | "OPEN";   // 4-tier circuit (domain 5)
    lastDriftDetectedAt:       string | null;
    policyProposalsPending:    number;
    policyProposalsAllTime:    number;
  };

  agentWeights: {
    lastUpdatedAt:   string | null;
    redisAvailable:  boolean;
    weightsInRedis:  boolean;
  };

  rlhf: {
    trainingDataPointsCollected: number;
    pendingProposals:            number;
    proposalsPendingReview:      number;
  };

  sloSummary: {
    totalSLOs:    number;
    breachedSLOs: number;
  };

  alerts: string[];
}

/** Status rules: critical if any alert contains "CRITICAL", degraded if any alerts, else healthy. */
export declare function getPhase7Health(): Promise<Phase7HealthResponse>;


// ─── API Endpoints Exposed ────────────────────────────────────────────────────
/*
  GET  /api/compliance/slos
  POST /api/compliance/slos/:sloId/record
  GET  /api/compliance/engine-health
  GET  /api/compliance/phase7-health     ← Phase 7 full health response
*/
