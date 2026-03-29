export interface BiasGroup {
  group: string;
  total: number;
  correct: number;
  accuracy: number;
  delta?: number;
}

export interface BiasAnalysisResult {
  analysisId: string;
  overallAccuracy: number;
  groups: BiasGroup[];
  maxBias: number;
  biasThreshold: number;
  biasDetected: boolean;
  worstGroup: string;
  bestGroup: string;
  recommendation: string;
  analyzedAt: string;
}

const BIAS_THRESHOLD = 0.10;

export function analyzeBias(results: Array<{
  correct: boolean;
  demographic?: string;
  sex?: string;
  ethnicity?: string;
  ageGroup?: string;
}>): BiasAnalysisResult {
  const groups: Record<string, { total: number; correct: number }> = {};

  for (const r of results) {
    const key = r.demographic ?? r.sex ?? r.ethnicity ?? r.ageGroup ?? "unspecified";
    if (!groups[key]) groups[key] = { total: 0, correct: 0 };
    groups[key].total++;
    if (r.correct) groups[key].correct++;
  }

  const overallCorrect = results.filter((r) => r.correct).length;
  const overallAccuracy = results.length > 0 ? overallCorrect / results.length : 0;

  const groupList: BiasGroup[] = Object.entries(groups).map(([group, g]) => ({
    group,
    total:    g.total,
    correct:  g.correct,
    accuracy: g.total > 0 ? +(g.correct / g.total).toFixed(3) : 0,
    delta:    +(( g.correct / g.total) - overallAccuracy).toFixed(3),
  }));

  const accuracies = groupList.map((g) => g.accuracy);
  const maxBias    = +(Math.max(...accuracies) - Math.min(...accuracies)).toFixed(3);
  const biasDetected = maxBias > BIAS_THRESHOLD;

  const sorted   = [...groupList].sort((a, b) => a.accuracy - b.accuracy);
  const worstGroup = sorted[0]?.group ?? "N/A";
  const bestGroup  = sorted[sorted.length - 1]?.group ?? "N/A";

  let recommendation = "";
  if (!biasDetected) {
    recommendation = "No significant performance disparity detected across demographic groups.";
  } else {
    recommendation = `Bias detected: ${(maxBias * 100).toFixed(1)}% accuracy gap between groups. Investigate training data balance for group "${worstGroup}" and expand labeled cases.`;
  }

  return {
    analysisId:      `BIAS-${Date.now()}`,
    overallAccuracy: +overallAccuracy.toFixed(3),
    groups:          groupList,
    maxBias,
    biasThreshold:   BIAS_THRESHOLD,
    biasDetected,
    worstGroup,
    bestGroup,
    recommendation,
    analyzedAt:      new Date().toISOString(),
  };
}

export function runDemoBiasAnalysis(): BiasAnalysisResult {
  const demoResults = [
    ...Array.from({ length: 40 }, () => ({ correct: Math.random() > 0.15, sex: "female" })),
    ...Array.from({ length: 40 }, () => ({ correct: Math.random() > 0.12, sex: "male" })),
    ...Array.from({ length: 20 }, () => ({ correct: Math.random() > 0.30, ethnicity: "hispanic", demographic: "hispanic" })),
    ...Array.from({ length: 20 }, () => ({ correct: Math.random() > 0.08, ethnicity: "white", demographic: "white" })),
  ];
  return analyzeBias(demoResults as any);
}

export function getBiasAnalysisStats() {
  return {
    active:         true,
    biasThreshold:  BIAS_THRESHOLD,
    supportedAxes:  ["demographic", "sex", "ethnicity", "ageGroup"],
  };
}
