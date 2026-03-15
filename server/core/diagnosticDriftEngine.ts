export type DriftSnapshot = {
  timestamp: string;
  caseId: string;
  complaint: string;
  topDiagnosis: string;
  topScore: number;
  differential: { diagnosis: string; score: number }[];
};

export type DiagnosticDriftInput = {
  priorSnapshots: DriftSnapshot[];
  currentSnapshot: DriftSnapshot;
};

export type DiagnosticDriftOutput = {
  hasDrift: boolean;
  driftLevel: "none" | "moderate" | "major";
  priorTopDiagnosis?: string;
  currentTopDiagnosis: string;
  reasons: string[];
};

export function diagnosticDriftEngine(
  input: DiagnosticDriftInput
): DiagnosticDriftOutput {
  const reasons: string[] = [];
  const prior = input.priorSnapshots[input.priorSnapshots.length - 1];

  if (!prior) {
    return {
      hasDrift: false,
      driftLevel: "none",
      currentTopDiagnosis: input.currentSnapshot.topDiagnosis,
      reasons: ["No prior snapshot — baseline established"],
    };
  }

  const sameTop = prior.topDiagnosis === input.currentSnapshot.topDiagnosis;
  const scoreDelta = Math.abs(prior.topScore - input.currentSnapshot.topScore);

  if (!sameTop) {
    reasons.push(
      `Top diagnosis changed: ${prior.topDiagnosis} → ${input.currentSnapshot.topDiagnosis}`
    );
  }
  if (scoreDelta >= 0.25) {
    reasons.push(
      `Confidence shifted by ${scoreDelta.toFixed(2)} (prior: ${prior.topScore.toFixed(2)}, now: ${input.currentSnapshot.topScore.toFixed(2)})`
    );
  }

  const driftLevel: DiagnosticDriftOutput["driftLevel"] =
    reasons.length === 0 ? "none" :
    (!sameTop && scoreDelta >= 0.25) ? "major" : "moderate";

  return {
    hasDrift: reasons.length > 0,
    driftLevel,
    priorTopDiagnosis: prior.topDiagnosis,
    currentTopDiagnosis: input.currentSnapshot.topDiagnosis,
    reasons,
  };
}
