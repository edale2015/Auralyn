/**
 * Network Learning Engine
 * Aggregates outcome feedback across hospital nodes to continuously improve
 * diagnostic weights. The "network moat" — shared intelligence gives the
 * multi-tenant platform a compounding accuracy advantage over single-clinic tools.
 */

export interface OutcomeFeedback {
  diagnosis: string;
  predictedDisposition: string;
  actualDisposition: string;
  outcome: "correct" | "under_triaged" | "over_triaged";
  clinicId?: string;
  weight?: number;  // optional case weight (e.g., severity multiplier)
}

export interface LearningWeights {
  [diagnosis: string]: number;
}

let _networkWeights: LearningWeights = {};

export function getNetworkWeights(): LearningWeights {
  return { ..._networkWeights };
}

export function updateNetworkLearning(data: OutcomeFeedback[]): LearningWeights {
  for (const d of data) {
    if (!_networkWeights[d.diagnosis]) _networkWeights[d.diagnosis] = 1.0;

    const multiplier = d.weight ?? 1.0;

    if (d.outcome === "correct") {
      _networkWeights[d.diagnosis] = Math.min(2.0, _networkWeights[d.diagnosis] + 0.01 * multiplier);
    } else if (d.outcome === "under_triaged") {
      // Under-triage is more dangerous — penalize harder
      _networkWeights[d.diagnosis] = Math.max(0.1, _networkWeights[d.diagnosis] - 0.05 * multiplier);
    } else if (d.outcome === "over_triaged") {
      _networkWeights[d.diagnosis] = Math.max(0.5, _networkWeights[d.diagnosis] - 0.02 * multiplier);
    }
  }

  return getNetworkWeights();
}

export function resetNetworkWeights(): void {
  _networkWeights = {};
}

export function getWeightSummary(): {
  totalDiagnoses: number;
  avgWeight: number;
  underPerforming: string[];
  overPerforming: string[];
} {
  const entries = Object.entries(_networkWeights);
  if (!entries.length) return { totalDiagnoses: 0, avgWeight: 1.0, underPerforming: [], overPerforming: [] };

  const avg = entries.reduce((s, [, v]) => s + v, 0) / entries.length;
  return {
    totalDiagnoses:  entries.length,
    avgWeight:       Math.round(avg * 1000) / 1000,
    underPerforming: entries.filter(([, v]) => v < 0.7).map(([k]) => k),
    overPerforming:  entries.filter(([, v]) => v > 1.5).map(([k]) => k),
  };
}
