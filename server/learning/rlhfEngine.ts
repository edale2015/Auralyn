import { updateWeight, getWeight } from "./weightStore";

export interface PredictedOutcome {
  diagnosis: string;
  triage: string;
  packId?: string;
}

export interface ActualOutcome {
  diagnosis: string;
  triage: string;
  correct?: boolean;
}

export interface ReinforcementResult {
  adjustments: Array<{ key: string; delta: number; newWeight: number }>;
  erBiasApplied: boolean;
}

export function reinforceOutcome(
  predicted: PredictedOutcome,
  actual: ActualOutcome
): ReinforcementResult {
  const adjustments: Array<{ key: string; delta: number; newWeight: number }> = [];
  let erBiasApplied = false;

  if (predicted.diagnosis === actual.diagnosis) {
    updateWeight(predicted.diagnosis, +0.1);
    adjustments.push({
      key: predicted.diagnosis,
      delta: +0.1,
      newWeight: getWeight(predicted.diagnosis),
    });
  } else {
    updateWeight(predicted.diagnosis, -0.2);
    adjustments.push({
      key: predicted.diagnosis,
      delta: -0.2,
      newWeight: getWeight(predicted.diagnosis),
    });

    updateWeight(actual.diagnosis, +0.2);
    adjustments.push({
      key: actual.diagnosis,
      delta: +0.2,
      newWeight: getWeight(actual.diagnosis),
    });
  }

  if (actual.triage === "ER" && predicted.triage !== "ER") {
    updateWeight("ER_bias", +0.5);
    erBiasApplied = true;
    adjustments.push({
      key: "ER_bias",
      delta: +0.5,
      newWeight: getWeight("ER_bias"),
    });
  }

  return { adjustments, erBiasApplied };
}

export function applyWeightToScore(clusterName: string, rawScore: number): number {
  const weight = getWeight(clusterName);
  return rawScore * weight;
}
