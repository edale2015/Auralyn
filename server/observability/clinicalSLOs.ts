/**
 * DOMAIN 3 — REC 3.2: Clinical SLO Definitions
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - PHYSICIAN_OVERRIDE_RATE — high override rate = AI accuracy problem (FDA audit)
 *   - RED_TEAM_CHALLENGE_RATE — if 0%: Red Team broken; if >15%: agent quality degraded
 *   - CONTRADICTION_DETECTION_RATE — ~3% baseline expected; if 0%: detector broken
 *   - Per-complaint-category ER_NOW sensitivity SLOs (Nuance DAX pattern)
 */

import { emitEvent } from "../controlTower/eventBus";
import { logger }    from "../utils/logger";

export type SloBreachAction = "alert" | "circuit_break" | "halt_system";

export interface ClinicalSLO {
  id:             string;
  name:           string;
  description:    string;
  target:         number;
  unit:           string;
  higherIsBetter: boolean;
  breachAction:   SloBreachAction;
  fdaAuditRequired: boolean;
  category:       "safety" | "compliance" | "performance" | "equity" | "complaint_category";
}

export interface SLOStatus {
  slo:           ClinicalSLO;
  currentValue:  number | null;
  breached:      boolean;
  trend:         "improving" | "stable" | "degrading";
  breachHistory: Array<{ at: string; value: number }>;
  lastCheckedAt: string;
}

export const CLINICAL_SLOS: ClinicalSLO[] = [
  // ── Core Safety SLOs ─────────────────────────────────────────────────────
  {
    id: "ER_NOW_SENSITIVITY",
    name: "ER_NOW Sensitivity",
    description: "True positive rate for ER_NOW dispositions — must catch 99% of true emergencies",
    target: 0.99, unit: "ratio", higherIsBetter: true,
    breachAction: "halt_system", fdaAuditRequired: true, category: "safety",
  },
  {
    id: "ER_NOW_FALSE_POSITIVE_RATE",
    name: "ER_NOW False Positive Rate",
    description: "Max 15% false ER_NOW — balances safety against over-triage",
    target: 0.15, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true, category: "safety",
  },
  {
    id: "HARD_STOP_BYPASS_RATE",
    name: "Hard Stop Bypass Rate",
    description: "Rate at which hard-stop rules trigger — elevation from baseline = new risk pattern",
    target: 0.02, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true, category: "safety",
  },
  {
    id: "CONTRADICTION_DETECTION_RATE",
    name: "LLM vs Raw Text Contradiction Detection Rate",
    description: "~3% baseline expected — if 0%: detector is broken; if >10%: LLM quality degraded",
    target: 0.10, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true, category: "safety",
  },
  // ── Compliance SLOs ───────────────────────────────────────────────────────
  {
    id: "INTAKE_COMPLETION_RATE",
    name: "Intake Completion Rate",
    description: "Cases reaching a disposition over cases initiated",
    target: 0.95, unit: "ratio", higherIsBetter: true,
    breachAction: "alert", fdaAuditRequired: false, category: "compliance",
  },
  {
    id: "PHYSICIAN_REVIEW_LATENCY",
    name: "Physician Review Latency",
    description: "Seconds from consensus to physician notification — max 5 minutes",
    target: 300, unit: "seconds", higherIsBetter: false,
    breachAction: "circuit_break", fdaAuditRequired: true, category: "compliance",
  },
  {
    id: "PHYSICIAN_OVERRIDE_RATE",
    name: "Physician Override Rate",
    description: "% of AI dispositions overridden by physicians — high rate = AI accuracy problem",
    target: 0.10, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true, category: "compliance",
  },
  {
    id: "CONFIDENCE_FLOOR_VIOLATIONS",
    name: "Confidence Floor Violation Rate",
    description: "% of cases where confidence was below disposition-specific floor",
    target: 0.05, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true, category: "compliance",
  },
  // ── Performance SLOs ─────────────────────────────────────────────────────
  {
    id: "AGENT_CONSENSUS_RATE",
    name: "Agent Consensus Rate",
    description: "80% of cases should reach unanimous consensus",
    target: 0.80, unit: "ratio", higherIsBetter: true,
    breachAction: "alert", fdaAuditRequired: false, category: "performance",
  },
  {
    id: "RED_TEAM_CHALLENGE_RATE",
    name: "Red Team Challenge Rate",
    description: "% of cases where Red Team finds material counter-evidence — expect 5–8%; if 0%: Red Team broken; if >15%: agent quality degraded",
    target: 0.15, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: false, category: "performance",
  },
  // ── Equity SLOs ───────────────────────────────────────────────────────────
  {
    id: "DEMOGRAPHIC_PARITY_DELTA",
    name: "Demographic Parity Delta",
    description: "Max 5% disposition rate difference across demographic groups (ACA §1557 civil rights exposure)",
    target: 0.05, unit: "ratio", higherIsBetter: false,
    breachAction: "alert", fdaAuditRequired: true, category: "equity",
  },
  // ── Per-Complaint-Category ER_NOW Sensitivity SLOs (Nuance DAX pattern) ──
  {
    id: "SENSITIVITY_CHEST_PAIN",
    name: "Chest Pain ER_NOW Sensitivity",
    description: "Must catch 99% of true ER_NOW cases presenting as chest pain",
    target: 0.99, unit: "ratio", higherIsBetter: true,
    breachAction: "halt_system", fdaAuditRequired: true, category: "complaint_category",
  },
  {
    id: "SENSITIVITY_FEVER_CHILD",
    name: "Pediatric Fever ER_NOW Sensitivity",
    description: "Must catch 99% of true ER_NOW cases in pediatric fever presentations — higher bar for pediatric",
    target: 0.99, unit: "ratio", higherIsBetter: true,
    breachAction: "halt_system", fdaAuditRequired: true, category: "complaint_category",
  },
  {
    id: "SENSITIVITY_COUGH",
    name: "Cough / Respiratory ER_NOW Sensitivity",
    description: "Must catch 97% of true ER_NOW cases in cough/respiratory presentations",
    target: 0.97, unit: "ratio", higherIsBetter: true,
    breachAction: "circuit_break", fdaAuditRequired: true, category: "complaint_category",
  },
  {
    id: "SENSITIVITY_FEVER_ADULT",
    name: "Adult Fever ER_NOW Sensitivity",
    description: "Must catch 97% of true ER_NOW cases in adult fever presentations",
    target: 0.97, unit: "ratio", higherIsBetter: true,
    breachAction: "circuit_break", fdaAuditRequired: true, category: "complaint_category",
  },
  {
    id: "SENSITIVITY_SORE_THROAT",
    name: "Sore Throat ER_NOW Sensitivity",
    description: "Must catch 95% of true ER_NOW cases in sore throat presentations (ENT-relevant)",
    target: 0.95, unit: "ratio", higherIsBetter: true,
    breachAction: "circuit_break", fdaAuditRequired: true, category: "complaint_category",
  },
  {
    id: "SENSITIVITY_DIZZINESS",
    name: "Dizziness ER_NOW Sensitivity",
    description: "Must catch 97% of true ER_NOW cases in dizziness presentations (stroke risk)",
    target: 0.97, unit: "ratio", higherIsBetter: true,
    breachAction: "circuit_break", fdaAuditRequired: true, category: "complaint_category",
  },
];

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
  const diff   = recent[2] - recent[0];
  if (Math.abs(diff) < 0.01) return "stable";
  return diff > 0 ? "improving" : "degrading";
}

export function getSLOStatuses(): SLOStatus[] {
  return CLINICAL_SLOS.map(slo => {
    const current  = sloCurrentValues[slo.id] ?? null;
    const history  = sloBreachHistory[slo.id] ?? [];
    const breached = current !== null && (slo.higherIsBetter ? current < slo.target : current > slo.target);
    return {
      slo, currentValue: current, breached,
      trend:        computeTrend(history),
      breachHistory: history,
      lastCheckedAt: new Date().toISOString(),
    };
  });
}

export function getSLOsByCategory(category: ClinicalSLO["category"]): SLOStatus[] {
  return getSLOStatuses().filter(s => s.slo.category === category);
}
