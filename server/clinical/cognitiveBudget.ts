/**
 * Cognitive Budget Controller
 *
 * Determines how much computational/clinical reasoning is needed for a given
 * patient presentation. Higher-complexity cases (elderly, chest pain, low BP)
 * get deeper reasoning — simpler cases get faster throughput.
 *
 * This controls:
 *   - Whether advanced hybrid reasoning is enabled
 *   - Whether multi-agent debate runs
 *   - Whether explainability layers are invoked
 *   - Pipeline stage bypasses for speed on low-complexity cases
 *
 * The budget level (1–5) gates downstream engine activation, letting the
 * system process 500+ patients/day by only running expensive reasoning
 * when the clinical picture warrants it.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CognitiveBudgetInput {
  ageYears?:   number;
  isPregnant?: boolean;
  symptoms?:   string[];
  vitalSigns?: Record<string, number>;
  history?:    string[];
}

export interface CognitiveBudgetResult {
  budgetLevel:              1 | 2 | 3 | 4 | 5;
  enableAdvancedReasoning:  boolean;   // budget ≥ 3
  enableDebate:             boolean;   // budget ≥ 4
  enableExplainability:     boolean;   // budget ≥ 2
  enableFullMoatPipeline:   boolean;   // budget ≥ 5
  rationale:                string[];  // which factors drove the score
}

// ── High-signal symptoms (each adds +2 budget) ────────────────────────────────
const HIGH_ACUITY_SYMPTOMS = new Set([
  "chest_pain",
  "chest pain",
  "shortness_of_breath",
  "shortness of breath",
  "altered_mental_status",
  "altered mental status",
  "syncope",
  "stroke_symptoms",
  "stroke symptoms",
  "severe_headache",
  "severe headache",
  "abdominal_pain_severe",
  "hemoptysis",
  "active_bleeding",
]);

// ── Moderate-signal symptoms (each adds +1 budget) ────────────────────────────
const MODERATE_ACUITY_SYMPTOMS = new Set([
  "fever",
  "vomiting",
  "dizziness",
  "palpitations",
  "back_pain_acute",
  "weakness",
  "urinary_symptoms",
  "rash",
]);

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Compute the cognitive budget for a patient encounter.
 *
 * The budget level reflects the complexity of the clinical picture:
 *   1 = simple / screening — fast path
 *   2 = routine — standard reasoning
 *   3 = moderate — advanced hybrid reasoning enabled
 *   4 = complex — debate engine enabled
 *   5 = critical — full pipeline with all engines
 */
export function computeCognitiveBudget(input: CognitiveBudgetInput): CognitiveBudgetResult {
  let budget   = 1;
  const rationale: string[] = [];
  const vitals  = input.vitalSigns ?? {};
  const symptoms = (input.symptoms ?? []).map(s => s.toLowerCase());

  // ── Vital sign red flags ─────────────────────────────────────────────────
  if ((vitals.systolicBp ?? vitals.systolicBP ?? 120) < 100) {
    budget += 2;
    rationale.push("systolic BP < 100 (+2)");
  }
  if ((vitals.respiratoryRate ?? 0) >= 22) {
    budget += 1;
    rationale.push("respiratory rate ≥ 22 (+1)");
  }
  if ((vitals.oxygenSaturation ?? vitals.spo2 ?? 100) < 92) {
    budget += 2;
    rationale.push("O₂ sat < 92% (+2)");
  }
  if (vitals.heartRate !== undefined && (vitals.heartRate > 120 || vitals.heartRate < 50)) {
    budget += 1;
    rationale.push("heart rate abnormal (+1)");
  }
  if ((vitals.gcs ?? 15) < 13) {
    budget += 2;
    rationale.push("GCS < 13 (+2)");
  }

  // ── Age risk factors ─────────────────────────────────────────────────────
  if ((input.ageYears ?? 0) > 65) {
    budget += 1;
    rationale.push("age > 65 (+1)");
  }
  if ((input.ageYears ?? 99) < 2) {
    budget += 2;
    rationale.push("age < 2 years (+2)");
  }

  // ── Pregnancy ────────────────────────────────────────────────────────────
  if (input.isPregnant) {
    budget += 1;
    rationale.push("pregnant (+1)");
  }

  // ── High-acuity symptoms ─────────────────────────────────────────────────
  for (const s of symptoms) {
    if (HIGH_ACUITY_SYMPTOMS.has(s)) {
      budget += 2;
      rationale.push(`high-acuity symptom: ${s} (+2)`);
    } else if (MODERATE_ACUITY_SYMPTOMS.has(s)) {
      budget += 1;
      rationale.push(`moderate-acuity symptom: ${s} (+1)`);
    }
  }

  // ── Complex history ──────────────────────────────────────────────────────
  const highRiskHistory = ["immunocompromised", "dialysis", "transplant", "anticoagulant"];
  for (const h of (input.history ?? [])) {
    if (highRiskHistory.some(r => h.toLowerCase().includes(r))) {
      budget += 1;
      rationale.push(`high-risk history: ${h} (+1)`);
    }
  }

  const capped = Math.min(budget, 5) as 1 | 2 | 3 | 4 | 5;

  return {
    budgetLevel:             capped,
    enableAdvancedReasoning: capped >= 3,
    enableDebate:            capped >= 4,
    enableExplainability:    capped >= 2,
    enableFullMoatPipeline:  capped >= 5,
    rationale,
  };
}
