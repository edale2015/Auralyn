import type { AutonomyDecision } from "./autonomyEngine";

interface ScoreSnapshot {
  primaryDiagnosis?: string;
  confidence?: number;
  differentials?: Array<{ diagnosis: string; probability?: number; confidence?: number }>;
}

function computeSecondaryConfidence(scores: ScoreSnapshot): { primary: string; confidence: number } {
  if (!scores.differentials || scores.differentials.length < 2) {
    return { primary: scores.primaryDiagnosis ?? "unknown", confidence: scores.confidence ?? 0 };
  }

  const sorted = [...scores.differentials].sort(
    (a, b) => (b.probability ?? b.confidence ?? 0) - (a.probability ?? a.confidence ?? 0)
  );

  const top = sorted[0];
  return {
    primary: top.diagnosis,
    confidence: top.probability ?? top.confidence ?? 0,
  };
}

export interface SecondOpinionResult {
  agree: boolean;
  firstPrimary: string;
  secondPrimary: string;
  reason: string;
}

export function runSecondOpinion(scores: ScoreSnapshot): SecondOpinionResult {
  const firstPrimary = scores.primaryDiagnosis ?? "unknown";
  const secondary = computeSecondaryConfidence(scores);

  const agree = secondary.primary.toLowerCase() === firstPrimary.toLowerCase();

  return {
    agree,
    firstPrimary,
    secondPrimary: secondary.primary,
    reason: agree
      ? `Both passes agree on primary: "${firstPrimary}"`
      : `Primary disagreement — first: "${firstPrimary}", second: "${secondary.primary}". Routing to physician review.`,
  };
}

export function applySecondOpinionGate(
  currentDecision: AutonomyDecision,
  scores: ScoreSnapshot,
  confidenceThreshold = 0.9
): AutonomyDecision {
  if (currentDecision.mode !== "AUTO") return currentDecision;

  const confidence = scores.confidence ?? 0;
  if (confidence < confidenceThreshold) return currentDecision;

  const opinion = runSecondOpinion(scores);

  if (!opinion.agree) {
    return {
      mode: "REVIEW",
      reason: `Second-opinion gate: ${opinion.reason}`,
    };
  }

  return {
    ...currentDecision,
    reason: `${currentDecision.reason} | Second opinion concurs.`,
  };
}
