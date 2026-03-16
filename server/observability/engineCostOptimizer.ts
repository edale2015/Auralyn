export interface EngineCostProfile {
  engine: string;
  latencyMs: number;
  costUnits: number;
  reliability: number;
}

const engineCosts: Record<string, Omit<EngineCostProfile, "engine">> = {
  bayesianDifferentialEngine: { latencyMs: 120, costUnits: 1.2, reliability: 0.95 },
  caseSimilarityEngine: { latencyMs: 80, costUnits: 0.4, reliability: 0.92 },
  llmExplanationEngine: { latencyMs: 400, costUnits: 4.5, reliability: 0.88 },
  ruleBasedEngine: { latencyMs: 30, costUnits: 0.1, reliability: 0.99 },
  redFlagEngine: { latencyMs: 25, costUnits: 0.1, reliability: 0.99 },
  nextQuestionSelector: { latencyMs: 50, costUnits: 0.3, reliability: 0.96 },
  protocolSelectionEngine: { latencyMs: 40, costUnits: 0.2, reliability: 0.98 },
  clusterScoringEngine: { latencyMs: 90, costUnits: 0.6, reliability: 0.93 },
  temporalRiskEngine: { latencyMs: 70, costUnits: 0.5, reliability: 0.94 },
  dispositionEngine: { latencyMs: 60, costUnits: 0.4, reliability: 0.97 },
  confidenceCalibrationEngine: { latencyMs: 55, costUnits: 0.3, reliability: 0.95 },
  consensusEngine: { latencyMs: 150, costUnits: 1.5, reliability: 0.91 },
  clinicalSkillEngine: { latencyMs: 45, costUnits: 0.2, reliability: 0.97 },
  emergencySafetyEngine: { latencyMs: 20, costUnits: 0.1, reliability: 0.99 },
  skillEngine: { latencyMs: 40, costUnits: 0.2, reliability: 0.96 },
};

export function getEngineCostProfile(engine: string): EngineCostProfile | null {
  const data = engineCosts[engine];
  if (!data) return null;
  return { engine, ...data };
}

export function getAllEngineCosts(): EngineCostProfile[] {
  return Object.entries(engineCosts).map(([engine, data]) => ({ engine, ...data }));
}

export function chooseLowestCostEngine(options: string[]): { engine: string; score: number } | null {
  let best: { engine: string; score: number } | null = null;

  options.forEach(engine => {
    const data = engineCosts[engine];
    if (!data) return;
    const score = data.latencyMs * 0.3 + data.costUnits * 100 * 0.5 + (1 - data.reliability) * 1000 * 0.2;
    if (!best || score < best.score) {
      best = { engine, score };
    }
  });

  return best;
}

export function estimatePipelineCost(engines: string[]): { totalLatencyMs: number; totalCostUnits: number; avgReliability: number } {
  let totalLatency = 0;
  let totalCost = 0;
  let reliabilityProduct = 1;
  let count = 0;

  engines.forEach(engine => {
    const data = engineCosts[engine];
    if (!data) return;
    totalLatency += data.latencyMs;
    totalCost += data.costUnits;
    reliabilityProduct *= data.reliability;
    count++;
  });

  return {
    totalLatencyMs: totalLatency,
    totalCostUnits: totalCost,
    avgReliability: count > 0 ? reliabilityProduct : 0,
  };
}
