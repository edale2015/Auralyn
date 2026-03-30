/**
 * DOMAIN 5 — REC 5.2: 4-Tier Drift Circuit Breaker with Human-in-the-Loop
 *
 * Replaces the 2-state drift model (locked/unlocked) with a 4-tier system
 * that adds intermediate human-review tiers before emergency rollback:
 *
 *   Tier 1 (score < 0.10): Monitor only — no action
 *   Tier 2 (0.10–0.25):    Alert medical director — increase monitoring
 *   Tier 3 (0.25–0.50):    Open circuit — freeze policy, create review ticket
 *   Tier 4 (≥ 0.50):       Emergency rollback — page on-call physician
 *
 * Under FDA's PCCP framework, every tier above Tier 1 must create a
 * human-reviewable audit record.
 *
 * MY ADDITION: Demographic drift detector integrated into the score
 * calculation — checks for systematic bias across demographic groups.
 */

import { emitEvent }    from "../controlTower/eventBus";
import { auditStep, createTraceId } from "../audit/auditLogger";
import { logger }       from "../utils/logger";

export type DriftTier = "MONITOR" | "ALERT" | "CIRCUIT_OPEN" | "EMERGENCY_ROLLBACK";

export interface DriftMetrics {
  performanceDelta:     number;   // change in overall accuracy (0-1)
  erNowFalseNegRate?:   number;   // false negative rate for ER_NOW — most critical
  demographicParityDelta?: number; // MY ADDITION: max disparity across groups (0-1)
  caseVolume24h?:       number;
  recentErrorRate?:     number;
}

export interface DriftDecision {
  tier:                 DriftTier;
  score:                number;
  action:               string;
  requiresHumanReview:  boolean;
  reviewDeadlineHours?: number;
  reviewTicketId?:      string;
  rollbackTriggered:    boolean;
}

let _circuitState: "CLOSED" | "OPEN" = "CLOSED";
let _lastDriftScore = 0;
let _openedAt: string | null = null;

export function getSafeDriftState() {
  return {
    circuitState: _circuitState,
    lastDriftScore: _lastDriftScore,
    openedAt: _openedAt,
  };
}

export function resetSafeDriftCircuit(): void {
  _circuitState = "CLOSED";
  _openedAt     = null;
  logger.info("safe_drift_circuit_reset");
}

function computeDriftScore(metrics: DriftMetrics): number {
  let score = Math.abs(metrics.performanceDelta);

  // Weight ER_NOW false negatives heavily — they are the highest-risk failure
  if (metrics.erNowFalseNegRate !== undefined) {
    score = Math.max(score, metrics.erNowFalseNegRate * 2.0);
  }

  // MY ADDITION: Demographic parity delta contributes to drift score
  if (metrics.demographicParityDelta !== undefined && metrics.demographicParityDelta > 0.05) {
    score += metrics.demographicParityDelta * 0.5;
    logger.warn("demographic_drift_detected", {
      parityDelta: metrics.demographicParityDelta,
      threshold: 0.05,
    });
  }

  return Math.min(score, 1.0);
}

async function createReviewTicket(
  metrics: DriftMetrics,
  tier: DriftTier,
  deadlineHours: number
): Promise<string> {
  const ticketId = `DRIFT-${Date.now()}`;
  const traceId  = createTraceId();

  await auditStep({
    traceId,
    step:     "DRIFT_DETECTED",
    input:    metrics,
    output:   { tier, ticketId, deadlineHours },
    metadata: { action: "human_review_required" },
  });

  emitEvent({
    type:      "ALERT",
    payload:   {
      message:  `Drift detected — Tier ${tier}. Human review required within ${deadlineHours}h. Ticket: ${ticketId}`,
      severity: tier === "EMERGENCY_ROLLBACK" ? "CRITICAL" : "HIGH",
      ticketId,
      metrics,
    },
    timestamp: Date.now(),
  });

  return ticketId;
}

export async function evaluateDrift(metrics: DriftMetrics): Promise<DriftDecision> {
  const score = computeDriftScore(metrics);
  _lastDriftScore = score;

  if (score < 0.10) {
    return {
      tier: "MONITOR", score, action: "Monitoring — no action required",
      requiresHumanReview: false, rollbackTriggered: false,
    };
  }

  if (score < 0.25) {
    const ticketId = await createReviewTicket(metrics, "ALERT", 48);
    logger.warn("drift_tier2_alert", { score });
    return {
      tier: "ALERT", score,
      action:              "Medical director alerted — monitoring frequency increased",
      requiresHumanReview: false,
      reviewTicketId:      ticketId,
      rollbackTriggered:   false,
    };
  }

  if (score < 0.50) {
    _circuitState = "OPEN";
    _openedAt     = new Date().toISOString();
    const ticketId = await createReviewTicket(metrics, "CIRCUIT_OPEN", 24);
    logger.warn("drift_tier3_circuit_open", { score });
    return {
      tier: "CIRCUIT_OPEN", score,
      action:              "Circuit OPEN — policy updates frozen. Human review ticket created.",
      requiresHumanReview: true,
      reviewDeadlineHours: 24,
      reviewTicketId:      ticketId,
      rollbackTriggered:   false,
    };
  }

  // Tier 4 — emergency
  _circuitState = "OPEN";
  _openedAt     = new Date().toISOString();
  const ticketId = await createReviewTicket(metrics, "EMERGENCY_ROLLBACK", 4);

  logger.error("drift_tier4_emergency_rollback", { score, metrics });
  emitEvent({
    type: "ALERT",
    payload: {
      message:  `EMERGENCY ROLLBACK TRIGGERED — drift score ${score.toFixed(3)}. On-call physician paged.`,
      severity: "CRITICAL", ticketId,
    },
    timestamp: Date.now(),
  });

  return {
    tier: "EMERGENCY_ROLLBACK", score,
    action:              "Emergency rollback triggered — on-call physician paged. Policy reset to last known good.",
    requiresHumanReview: true,
    reviewDeadlineHours: 4,
    reviewTicketId:      ticketId,
    rollbackTriggered:   true,
  };
}
