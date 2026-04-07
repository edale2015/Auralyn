export interface DifferentialResult {
  diagnosis: string;
  posterior: number;
}

export interface PosteriorAnalysis {
  topDiagnosis: string;
  topPosterior: number;
  differential: DifferentialResult[];
  entropy: number;
  margin: number;
  isUncertain: boolean;
}

export interface ClinicalDecision {
  disposition: string;
  primaryDiagnosis: string;
  differential: PosteriorAnalysis;
  reasoning: string[];
}

const UNCERTAIN_POSTERIOR_THRESHOLD = 0.6;
const UNCERTAIN_MARGIN_THRESHOLD = 0.15;
const UNCERTAIN_ENTROPY_THRESHOLD = 1.2;
const RISK_OVERRIDE_FLOOR = 0.05;
const MINIMUM_SYMPTOMS_FOR_DECISION = 2;

const HIGH_RISK_DIAGNOSES = new Set([
  "pulmonary_embolism",
  "meningitis",
  "mi",
  "myocardial_infarction",
  "stroke",
  "aortic_dissection",
  "subarachnoid_hemorrhage",
  "ectopic_pregnancy",
  "testicular_torsion",
  "ovarian_torsion",
  "fournier_gangrene",
  "sepsis",
  "anaphylaxis",
  "tension_pneumothorax",
]);

export function computeEntropy(differential: DifferentialResult[]): number {
  return -differential.reduce((sum, d) => {
    return sum + (d.posterior > 0 ? d.posterior * Math.log(d.posterior) : 0);
  }, 0);
}

export function analyzePosterior(
  differential: DifferentialResult[]
): PosteriorAnalysis {
  if (!differential.length) {
    throw new Error(
      "[PosteriorAnalysis] Cannot analyze an empty differential"
    );
  }

  const sorted = [...differential].sort((a, b) => b.posterior - a.posterior);

  const top = sorted[0];
  const second = sorted[1];

  const entropy = computeEntropy(sorted);
  const margin = second != null ? top.posterior - second.posterior : 1;

  const isUncertain =
    top.posterior < UNCERTAIN_POSTERIOR_THRESHOLD ||
    margin < UNCERTAIN_MARGIN_THRESHOLD ||
    entropy > UNCERTAIN_ENTROPY_THRESHOLD;

  return {
    topDiagnosis: top.diagnosis,
    topPosterior: top.posterior,
    differential: sorted,
    entropy,
    margin,
    isUncertain,
  };
}

export function applyRiskOverride(analysis: PosteriorAnalysis): boolean {
  return analysis.differential.some(
    (d) =>
      HIGH_RISK_DIAGNOSES.has(d.diagnosis.toLowerCase()) &&
      d.posterior >= RISK_OVERRIDE_FLOOR
  );
}

export function deriveDisposition(
  analysis: PosteriorAnalysis,
  symptoms: string[]
): ClinicalDecision {
  const reasoning: string[] = [];

  if (applyRiskOverride(analysis)) {
    const triggered = analysis.differential
      .filter(
        (d) =>
          HIGH_RISK_DIAGNOSES.has(d.diagnosis.toLowerCase()) &&
          d.posterior >= RISK_OVERRIDE_FLOOR
      )
      .map((d) => `${d.diagnosis} (${(d.posterior * 100).toFixed(1)}%)`);
    reasoning.push(`High-risk diagnosis in differential: ${triggered.join(", ")}`);
    return {
      disposition: "ER_NOW",
      primaryDiagnosis: analysis.topDiagnosis,
      differential: analysis,
      reasoning,
    };
  }

  if (symptoms.length < MINIMUM_SYMPTOMS_FOR_DECISION) {
    reasoning.push(
      `Insufficient symptom data (${symptoms.length} symptom(s) < minimum ${MINIMUM_SYMPTOMS_FOR_DECISION})`
    );
    return {
      disposition: "NEEDS_MORE_DATA",
      primaryDiagnosis: analysis.topDiagnosis,
      differential: analysis,
      reasoning,
    };
  }

  if (analysis.isUncertain) {
    if (analysis.topPosterior < UNCERTAIN_POSTERIOR_THRESHOLD) {
      reasoning.push(
        `Top posterior ${analysis.topPosterior.toFixed(3)} below confidence threshold ${UNCERTAIN_POSTERIOR_THRESHOLD}`
      );
    }
    if (analysis.margin < UNCERTAIN_MARGIN_THRESHOLD) {
      reasoning.push(
        `Low separation between top diagnoses (margin=${analysis.margin.toFixed(3)})`
      );
    }
    if (analysis.entropy > UNCERTAIN_ENTROPY_THRESHOLD) {
      reasoning.push(
        `High entropy=${analysis.entropy.toFixed(3)} — diagnosis distribution is diffuse`
      );
    }
    return {
      disposition: "NEEDS_MORE_DATA",
      primaryDiagnosis: analysis.topDiagnosis,
      differential: analysis,
      reasoning,
    };
  }

  if (analysis.topPosterior > 0.7) {
    reasoning.push(
      `Clear winner: ${analysis.topDiagnosis} at ${(analysis.topPosterior * 100).toFixed(1)}%`
    );
    return {
      disposition: "HOME",
      primaryDiagnosis: analysis.topDiagnosis,
      differential: analysis,
      reasoning,
    };
  }

  reasoning.push(
    `Moderate confidence — ${analysis.topDiagnosis} at ${(analysis.topPosterior * 100).toFixed(1)}%`
  );
  return {
    disposition: "URGENT_CARE",
    primaryDiagnosis: analysis.topDiagnosis,
    differential: analysis,
    reasoning,
  };
}

export function addCalibrationGuard(analysis: PosteriorAnalysis): void {
  if (analysis.topPosterior > 0.8 && analysis.margin < 0.1) {
    console.warn(
      `[PosteriorAnalysis] High posterior (${analysis.topPosterior.toFixed(3)}) but low separation (margin=${analysis.margin.toFixed(3)}) — possible overconfidence`
    );
  }
}
