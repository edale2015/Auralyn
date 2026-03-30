/**
 * DOMAIN 5 — REC 5.2: 4-Tier Drift Circuit Breaker
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - ER_NOW FNR >2% directly forces Tier 3 (CIRCUIT_OPEN) — no formula needed
 *   - Raise ER_NOW false negative multiplier from 2x → 3x
 *   - Stratified minimum sample sizes (global: 100, per-group: 50, ER_NOW: 20)
 */

import { emitEvent }    from "../controlTower/eventBus";
import { auditStep, createTraceId } from "../audit/auditLogger";
import { logger }       from "../utils/logger";

export type DriftTier = "MONITOR" | "ALERT" | "CIRCUIT_OPEN" | "EMERGENCY_ROLLBACK";

export interface DriftMetrics {
  performanceDelta:        number;
  erNowFalseNegRate?:      number;
  demographicParityDelta?: number;
  caseVolume24h?:          number;
  recentErrorRate?:        number;
}

export interface DriftDecision {
  tier:                DriftTier;
  score:               number;
  action:              string;
  requiresHumanReview: boolean;
  reviewDeadlineHours?: number;
  reviewTicketId?:     string;
  rollbackTriggered:   boolean;
  erNowFnrOverride?:   boolean;  // true if ER_NOW FNR >2% forced Tier 3 directly
}

/**
 * Stratified minimum sample sizes (Claude rec: 30 was too low).
 * From clinical AI monitoring literature (Caruana et al.):
 *   global: 100, per-group: 50, ER_NOW-only: 20 (rare event, smaller OK)
 */
export const MINIMUM_SAMPLE_SIZES = {
  globalAnalysis:    100,
  perGroupAnalysis:   50,
  erNowOnlyAnalysis:  20,
};

let _circuitState:  "CLOSED" | "OPEN" = "CLOSED";
let _lastDriftScore = 0;
let _openedAt: string | null = null;

export function getSafeDriftState() {
  return { circuitState: _circuitState, lastDriftScore: _lastDriftScore, openedAt: _openedAt };
}

export function resetSafeDriftCircuit(): void {
  _circuitState = "CLOSED";
  _openedAt     = null;
  logger.info("safe_drift_circuit_reset");
}

/**
 * Claude rec: updated drift score formula.
 *   - ER_NOW FNR >2% → directly force Tier 3 minimum (score 0.26)
 *   - ER_NOW FNR multiplier raised from 2x → 3x
 *   - Demographic parity still contributes 0.5x when > 5%
 */
function computeDriftScore(metrics: DriftMetrics): { score: number; erNowFnrOverride: boolean } {
  let score = Math.abs(metrics.performanceDelta);
  let erNowFnrOverride = false;

  if (metrics.erNowFalseNegRate !== undefined) {
    if (metrics.erNowFalseNegRate > 0.02) {
      // Claude rec: >2% FNR = immediate Tier 3 — no debate
      score = Math.max(score, 0.26);
      erNowFnrOverride = true;
      logger.warn("er_now_fnr_tier3_override", {
        erNowFalseNegRate: metrics.erNowFalseNegRate,
        threshold: 0.02,
      });
    } else {
      // Raise multiplier from 2x → 3x per Claude rec
      score = Math.max(score, metrics.erNowFalseNegRate * 3.0);
    }
  }

  if (metrics.demographicParityDelta !== undefined && metrics.demographicParityDelta > 0.05) {
    score += metrics.demographicParityDelta * 0.5;
    logger.warn("demographic_drift_detected", {
      parityDelta: metrics.demographicParityDelta, threshold: 0.05,
    });
  }

  return { score: Math.min(score, 1.0), erNowFnrOverride };
}

async function createReviewTicket(metrics: DriftMetrics, tier: DriftTier, deadlineHours: number): Promise<string> {
  const ticketId = `DRIFT-${Date.now()}`;
  const traceId  = createTraceId();

  await auditStep({
    traceId, step: "DRIFT_DETECTED",
    input:    metrics,
    output:   { tier, ticketId, deadlineHours },
    metadata: { action: "human_review_required" },
  });

  emitEvent({
    type:    "ALERT",
    payload: {
      message:  `Drift detected — Tier ${tier}. Human review required within ${deadlineHours}h. Ticket: ${ticketId}`,
      severity: tier === "EMERGENCY_ROLLBACK" ? "CRITICAL" : "HIGH",
      ticketId, metrics,
    },
    timestamp: Date.now(),
  });

  return ticketId;
}

export async function evaluateDrift(metrics: DriftMetrics): Promise<DriftDecision> {
  const { score, erNowFnrOverride } = computeDriftScore(metrics);
  _lastDriftScore = score;

  if (score < 0.10) {
    return {
      tier: "MONITOR", score,
      action:              "Monitoring — no action required",
      requiresHumanReview: false,
      rollbackTriggered:   false,
      erNowFnrOverride,
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
      erNowFnrOverride,
    };
  }

  if (score < 0.50) {
    _circuitState = "OPEN";
    _openedAt     = new Date().toISOString();
    const ticketId = await createReviewTicket(metrics, "CIRCUIT_OPEN", 24);
    logger.warn("drift_tier3_circuit_open", { score, erNowFnrOverride });
    return {
      tier: "CIRCUIT_OPEN", score,
      action:              erNowFnrOverride
        ? "Circuit OPEN — ER_NOW false negative rate exceeded 2% threshold. Policy frozen."
        : "Circuit OPEN — policy updates frozen. Human review ticket created.",
      requiresHumanReview: true,
      reviewDeadlineHours: 24,
      reviewTicketId:      ticketId,
      rollbackTriggered:   false,
      erNowFnrOverride,
    };
  }

  _circuitState = "OPEN";
  _openedAt     = new Date().toISOString();
  const ticketId = await createReviewTicket(metrics, "EMERGENCY_ROLLBACK", 4);
  logger.error("drift_tier4_emergency_rollback", { score, metrics });
  emitEvent({
    type:    "ALERT",
    payload: { message: `EMERGENCY ROLLBACK TRIGGERED — drift score ${score.toFixed(3)}. On-call physician paged.`, severity: "CRITICAL", ticketId },
    timestamp: Date.now(),
  });

  return {
    tier: "EMERGENCY_ROLLBACK", score,
    action:              "Emergency rollback triggered — on-call physician paged. Policy reset to last known good.",
    requiresHumanReview: true,
    reviewDeadlineHours: 4,
    reviewTicketId:      ticketId,
    rollbackTriggered:   true,
    erNowFnrOverride,
  };
}
