/**
 * Hallucination extension guards — five additional safety checks beyond
 * the core hallucinationGuards.ts module.
 *
 * All guards return ExtraGuardResult, which is composable with the
 * main disposition pipeline.
 */

export interface ExtraGuardResult {
  blocked: boolean;
  abstain: boolean;
  reasons: string[];
}

type Observation = { feature: string; value: unknown };

// ─── 1. Impossible physiologic combination ─────────────────────────────────

const IMPOSSIBLE_COMBOS: Array<[string, string, string]> = [
  ["hypotension",   "normal_perfusion", "Hypotension + normal perfusion is physiologically impossible"],
  ["bradycardia",   "tachycardia",      "Bradycardia and tachycardia cannot coexist"],
  ["apnea",         "normal_breathing", "Apnea and normal breathing cannot coexist"],
  ["severe_anemia", "normal_hgb",       "Severe anaemia and normal haemoglobin cannot coexist"],
];

export function detectImpossibleCombo(observations: Observation[]): ExtraGuardResult {
  const features = new Set(observations.map((o) => o.feature));

  for (const [a, b, reason] of IMPOSSIBLE_COMBOS) {
    if (features.has(a) && features.has(b)) {
      return { blocked: true, abstain: false, reasons: [reason] };
    }
  }
  return { blocked: false, abstain: false, reasons: [] };
}

// ─── 2. Confidence compression (anti-overconfidence) ───────────────────────

const CONF_FLOOR = 0.2;
const CONF_CEIL  = 0.8;

export function compressConfidence(prob: number): number {
  if (prob > CONF_CEIL) return CONF_CEIL;
  if (prob < CONF_FLOOR) return CONF_FLOOR;
  return prob;
}

// ─── 3. Multi-diagnosis coverage requirement ────────────────────────────────

export function requireDifferentialSpread(
  posterior: Record<string, number>,
): ExtraGuardResult {
  const top3 = Object.values(posterior)
    .sort((a, b) => b - a)
    .slice(0, 3);

  if (top3.length < 3) return { blocked: false, abstain: false, reasons: [] };

  const spread = (top3[0] ?? 0) - (top3[2] ?? 0);

  if (spread < 0.2) {
    return {
      blocked: false,
      abstain: true,
      reasons: ["Differential spread < 0.2 — diagnosis uncertainty too high for autonomous action"],
    };
  }
  return { blocked: false, abstain: false, reasons: [] };
}

// ─── 4. Dangerous-condition rule-out check ─────────────────────────────────

const DANGEROUS_DX = ["pe", "acs", "stroke", "sepsis", "meningitis", "aortic_dissection"];
const DX_POSTERIOR_THRESHOLD = 0.1;

export function ensureDangerousRuledOut(
  topDx: string,
  posterior: Record<string, number>,
): ExtraGuardResult {
  const reasons: string[] = [];

  for (const dx of DANGEROUS_DX) {
    const prob = posterior[dx] ?? 0;
    if (prob > DX_POSTERIOR_THRESHOLD && topDx !== dx) {
      reasons.push(`Dangerous condition '${dx}' (P=${prob.toFixed(2)}) not yet ruled out`);
    }
  }

  return {
    blocked: reasons.length > 0,
    abstain: false,
    reasons,
  };
}

// ─── 5. Temporal consistency check ─────────────────────────────────────────

export function checkTemporalConsistency(observations: Observation[]): ExtraGuardResult {
  const featureMap = new Map(observations.map((o) => [o.feature, o.value]));

  const onset    = featureMap.get("onset_hours");
  const duration = featureMap.get("duration_days");

  const reasons: string[] = [];

  if (typeof onset === "number" && typeof duration === "number") {
    if (onset > 24 && duration < 1) {
      reasons.push(
        `Temporal inconsistency: onset_hours=${onset} but duration_days=${duration} (< 1 day)`,
      );
    }
  }

  return { blocked: reasons.length > 0, abstain: false, reasons };
}

// ─── 6. Risk floor enforcement ─────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  home:                       0,
  urgent_care:                1,
  physician_review_required:  2,
  ed:                         3,
  call_911:                   4,
};

export function applyRiskFloor(
  topDiagnosis: string,
  proposedDisposition: string,
  riskFloors: Record<string, string>,
): ExtraGuardResult {
  const minimum = riskFloors[topDiagnosis];
  if (!minimum) return { blocked: false, abstain: false, reasons: [] };

  const proposed = SEVERITY_ORDER[proposedDisposition] ?? 0;
  const floor    = SEVERITY_ORDER[minimum]             ?? 0;

  if (proposed < floor) {
    return {
      blocked: true,
      abstain: false,
      reasons: [`Disposition '${proposedDisposition}' below risk floor '${minimum}' for ${topDiagnosis}`],
    };
  }
  return { blocked: false, abstain: false, reasons: [] };
}

// ─── 7. Low-support abstention ─────────────────────────────────────────────

export function lowSupportAbstention(
  evidenceCoverageScore: number,
  contradictionScore:    number,
  posteriorTopProb:      number,
): ExtraGuardResult {
  const reasons: string[] = [];

  if (evidenceCoverageScore < 0.2) reasons.push("Evidence coverage too low (< 0.2)");
  if (contradictionScore    > 0.5) reasons.push("Contradiction burden too high (> 0.5)");
  if (posteriorTopProb      < 0.35) reasons.push("Posterior top probability too low (< 0.35)");

  return { blocked: false, abstain: reasons.length > 0, reasons };
}
