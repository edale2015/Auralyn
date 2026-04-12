export interface DiagnosisEntry {
  diagnosis:   string;
  probability: number;
}

export interface UncertaintyResult {
  uncertainty:       number;
  topDiagnosis:      string | null;
  secondDiagnosis:   string | null;
  requiresEscalation: boolean;
  rationale:         string;
}

const ESCALATION_THRESHOLD      = 0.15;
const HIGH_UNCERTAINTY_THRESHOLD = 0.25;

export function calculateUncertainty(diagnoses: DiagnosisEntry[]): UncertaintyResult {
  if (diagnoses.length === 0) {
    return {
      uncertainty:        1.0,
      topDiagnosis:       null,
      secondDiagnosis:    null,
      requiresEscalation: true,
      rationale:          "No diagnoses available — maximum uncertainty",
    };
  }

  const sorted = [...diagnoses].sort((a, b) => b.probability - a.probability);
  const top    = sorted[0];
  const second = sorted[1];

  const delta       = top.probability - (second?.probability ?? 0);
  const uncertainty = 1 - delta;

  const requiresEscalation = delta < ESCALATION_THRESHOLD;
  const isHighUncertainty  = delta < HIGH_UNCERTAINTY_THRESHOLD;

  let rationale = `Top diagnosis '${top.diagnosis}' (p=${top.probability.toFixed(2)})`;
  if (second) {
    rationale += `, second '${second.diagnosis}' (p=${second.probability.toFixed(2)})`;
    rationale += `, delta=${delta.toFixed(2)}`;
  }

  if (requiresEscalation) {
    rationale += " — close call, physician review recommended.";
  } else if (isHighUncertainty) {
    rationale += " — moderate uncertainty, consider additional data.";
  } else {
    rationale += " — confident differentiation.";
  }

  return {
    uncertainty,
    topDiagnosis:      top.diagnosis,
    secondDiagnosis:   second?.diagnosis ?? null,
    requiresEscalation,
    rationale,
  };
}
