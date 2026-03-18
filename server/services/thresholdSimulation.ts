export type ThresholdStrategy = {
  name: string;
  confidenceThreshold: number;
  batchApprovalEnabled: boolean;
};

export type SimulatedCase = {
  rawConfidence: number;
  wasCorrect: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

export type ThresholdSimulationResult = {
  strategy: string;
  autoApproved: number;
  mandatoryReviewed: number;
  estimatedAccuracy: number;
  estimatedCostPerCase: number;
  estimatedOverrideRate: number;
};

export function simulateThresholdStrategies(
  cases: SimulatedCase[],
  strategies: ThresholdStrategy[]
): ThresholdSimulationResult[] {
  return strategies.map(strategy => {
    let autoApproved = 0;
    let mandatoryReviewed = 0;
    let correctCount = 0;
    let estimatedTotalCost = 0;
    let overrides = 0;

    for (const c of cases) {
      const mandatory =
        c.riskLevel === "HIGH" ||
        c.rawConfidence < strategy.confidenceThreshold ||
        !strategy.batchApprovalEnabled;

      if (mandatory) {
        mandatoryReviewed++;
        estimatedTotalCost += 7.5;
        if (!c.wasCorrect) overrides++;
        if (c.wasCorrect) correctCount++;
      } else {
        autoApproved++;
        estimatedTotalCost += 2.2;
        if (!c.wasCorrect) overrides++;
        if (c.wasCorrect) correctCount++;
      }
    }

    const estimatedAccuracy = cases.length ? correctCount / cases.length : 0;
    const estimatedCostPerCase = cases.length ? estimatedTotalCost / cases.length : 0;
    const estimatedOverrideRate = cases.length ? overrides / cases.length : 0;

    return {
      strategy: strategy.name,
      autoApproved,
      mandatoryReviewed,
      estimatedAccuracy: Number((estimatedAccuracy * 100).toFixed(2)),
      estimatedCostPerCase: Number(estimatedCostPerCase.toFixed(2)),
      estimatedOverrideRate: Number((estimatedOverrideRate * 100).toFixed(2))
    };
  });
}
