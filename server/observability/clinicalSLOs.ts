/**
 * DOMAIN 3 — REC 3.2: Clinical SLO Definitions
 *
 * Standard software SLOs (p99 latency, error rate) are insufficient for
 * clinical AI. These SLOs are outcome-based — they measure the safety
 * and accuracy of clinical decisions, not just server performance.
 *
 * Breach actions range from alert to halt_system (for ER_NOW sensitivity).
 *
 * MY ADDITION: SLO tracking state with breach history so the Control Tower
 * can show trend lines, not just current point-in-time values.
 */

import { emitEvent } from "../controlTower/eventBus";
import { logger }    from "../utils/logger";

export type SloBreachAction = "alert" | "circuit_break" | "halt_system";

export interface ClinicalSLO {
  id:           string;
  name:         string;
  description:  string;
  target:       number;
  unit:         string;        // "ratio", "seconds", "count"
  higherIsBetter: boolean;
  breachAction: SloBreachAction;
  fdaAuditRequired: boolean;  // Must be logged for FDA reporting
}

export interface SLOStatus {
  slo:          ClinicalSLO;
  currentValue: number | null;
  breached:     boolean;
  trend:        "improving" | "stable" | "degrading";   // MY ADDITION
  breachHistory: Array<{ at: string; value: number }>;   // MY ADDITION
  lastCheckedAt: string;
}

export const CLINICAL_SLOS: ClinicalSLO[] = [
  {
    id: "ER_NOW_SENSITIVITY",
    name: "ER_NOW Sensitivity",
    description: "True positive rate for ER_NOW dispositions — must catch 99% of true emergencies",
    target: 0.99, unit: "ratio", higherIsBetter: true,
    breachAction: "halt_system", fdaAuditRequired: true,
  },
  {
    id: "ER_NOW_FALSE_POSITIVE_RATE",
    name: "ER_NOW False Positive Rate",
    description: "Max 15% false ER_NOW — balances safety against over-triage",
    target: 0.15, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true,
  },
  {
    id: "INTAKE_COMPLETION_RATE",
    name: "Intake Completion Rate",
    description: "Cases reaching a disposition over cases initiated",
    target: 0.95, unit: "ratio", higherIsBetter: true,
    breachAction: "alert", fdaAuditRequired: false,
  },
  {
    id: "PHYSICIAN_REVIEW_LATENCY",
    name: "Physician Review Latency",
    description: "Seconds from consensus to physician notification — max 5 minutes",
    target: 300, unit: "seconds", higherIsBetter: false,
    breachAction: "circuit_break", fdaAuditRequired: true,
  },
  {
    id: "AGENT_CONSENSUS_RATE",
    name: "Agent Consensus Rate",
    description: "80% of cases should reach unanimous consensus",
    target: 0.80, unit: "ratio", higherIsBetter: true,
    breachAction: "alert", fdaAuditRequired: false,
  },
  {
    id: "DEMOGRAPHIC_PARITY_DELTA",
    name: "Demographic Parity Delta",
    description: "Max 5% disposition rate difference across demographic groups (HIPAA civil rights exposure)",
    target: 0.05, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true,
  },
  {
    id: "CONFIDENCE_FLOOR_VIOLATIONS",
    name: "Confidence Floor Violation Rate",
    description: "% of cases where confidence was below disposition-specific floor",
    target: 0.05, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true,
  },
  {
    id: "HARD_STOP_BYPASS_RATE",
    name: "Hard Stop Bypass Rate",
    description: "Rate at which hard-stop rules trigger — elevation from baseline = new risk pattern",
    target: 0.02, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true,
  },
];

// MY ADDITION: In-memory SLO tracking state
const sloBreachHistory: Record<string, Array<{ at: string; value: number }>> = {};
const sloCurrentValues: Record<string, number | null> = {};

export function recordSLOValue(sloId: string, value: number): void {
  const slo = CLINICAL_SLOS.find(s => s.id === sloId);
  if (!slo) return;

  sloCurrentValues[sloId] = value;

  const breached = slo.higherIsBetter ? value < slo.target : value > slo.target;

  if (breached) {
    if (!sloBreachHistory[sloId]) sloBreachHistory[sloId] = [];
    sloBreachHistory[sloId].push({ at: new Date().toISOString(), value });
    if (sloBreachHistory[sloId].length > 50) sloBreachHistory[sloId].shift();

    logger.warn("slo_breached", { sloId, target: slo.target, actual: value, action: slo.breachAction });

    if (slo.breachAction === "halt_system") {
      emitEvent({
        type: "ALERT",
        payload: {
          message:  `CRITICAL SLO BREACH: ${slo.name} — value ${value} vs target ${slo.target}. Action: ${slo.breachAction}`,
          severity: "CRITICAL", sloId,
        },
        timestamp: Date.now(),
      });
    }
  }
}

function computeTrend(history: Array<{ value: number }>): "improving" | "stable" | "degrading" {
  if (history.length < 3) return "stable";
  const recent = history.slice(-3).map(h => h.value);
  const diff = recent[2] - recent[0];
  if (Math.abs(diff) < 0.01) return "stable";
  return diff > 0 ? "improving" : "degrading";
}

export function getSLOStatuses(): SLOStatus[] {
  return CLINICAL_SLOS.map(slo => {
    const current    = sloCurrentValues[slo.id] ?? null;
    const history    = sloBreachHistory[slo.id] ?? [];
    const breached   = current !== null && (slo.higherIsBetter ? current < slo.target : current > slo.target);

    return {
      slo,
      currentValue: current,
      breached,
      trend:        computeTrend(history),
      breachHistory: history,
      lastCheckedAt: new Date().toISOString(),
    };
  });
}
