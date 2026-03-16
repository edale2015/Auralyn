export interface DiagnosisSignal {
  diagnosis: string;
  bayesian?: number;
  similarity?: number;
  graphPrior?: number;
  protocolWeight?: number;
  physicianOverride?: number;
}

export interface UnifiedDiagnosisResult {
  diagnosis: string;
  probability: number;
  rank: number;
  signalBreakdown: {
    bayesian: number;
    similarity: number;
    graphPrior: number;
    protocolWeight: number;
    physicianOverride: number;
  };
}

const WEIGHTS = {
  bayesian: 0.30,
  similarity: 0.20,
  graphPrior: 0.15,
  protocolWeight: 0.20,
  physicianOverride: 0.15,
};

export function computeDiagnosisProbability(signal: DiagnosisSignal): number {
  let score = 0;
  score += (signal.bayesian ?? 0) * WEIGHTS.bayesian;
  score += (signal.similarity ?? 0) * WEIGHTS.similarity;
  score += (signal.graphPrior ?? 0) * WEIGHTS.graphPrior;
  score += (signal.protocolWeight ?? 0) * WEIGHTS.protocolWeight;
  score += (signal.physicianOverride ?? 0) * WEIGHTS.physicianOverride;
  return Math.min(Math.max(score, 0), 1);
}

export function runUnifiedReasoning(signals: DiagnosisSignal[]): UnifiedDiagnosisResult[] {
  const results = signals.map(s => ({
    diagnosis: s.diagnosis,
    probability: Math.round(computeDiagnosisProbability(s) * 1000) / 1000,
    rank: 0,
    signalBreakdown: {
      bayesian: Math.round((s.bayesian ?? 0) * WEIGHTS.bayesian * 1000) / 1000,
      similarity: Math.round((s.similarity ?? 0) * WEIGHTS.similarity * 1000) / 1000,
      graphPrior: Math.round((s.graphPrior ?? 0) * WEIGHTS.graphPrior * 1000) / 1000,
      protocolWeight: Math.round((s.protocolWeight ?? 0) * WEIGHTS.protocolWeight * 1000) / 1000,
      physicianOverride: Math.round((s.physicianOverride ?? 0) * WEIGHTS.physicianOverride * 1000) / 1000,
    },
  }));

  results.sort((a, b) => b.probability - a.probability);
  results.forEach((r, i) => { r.rank = i + 1; });

  return results;
}

export function getReasoningWeights() {
  return { ...WEIGHTS };
}
