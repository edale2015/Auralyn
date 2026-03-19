type ScenarioInput = {
  patientsPerDay?: number;
  avgRevenue?: number;
  denialRate?: number;
  capacity?: number;
  label?: string;
};

type ScenarioResult = {
  label: string;
  projectedDailyRevenue: number;
  projectedMonthlyRevenue: number;
  projectedAnnualRevenue: number;
  effectivePatientsPerDay: number;
  revenuePerPatient: number;
  state: ScenarioInput;
};

export class WhatIfEngine {
  runScenario(baseState: any, changes: ScenarioInput): ScenarioResult {
    const merged = { ...baseState, ...changes };

    const dailyRevenue = merged.patientsPerDay * merged.avgRevenue * (1 - merged.denialRate);

    return {
      label: changes.label || "Custom Scenario",
      projectedDailyRevenue: Math.round(dailyRevenue),
      projectedMonthlyRevenue: Math.round(dailyRevenue * 22),
      projectedAnnualRevenue: Math.round(dailyRevenue * 260),
      effectivePatientsPerDay: merged.patientsPerDay,
      revenuePerPatient: Math.round(merged.avgRevenue * (1 - merged.denialRate)),
      state: merged
    };
  }

  compareScenarios(baseState: any, scenarios: ScenarioInput[]): ScenarioResult[] {
    return scenarios
      .map(s => this.runScenario(baseState, s))
      .sort((a, b) => b.projectedDailyRevenue - a.projectedDailyRevenue);
  }
}

export class StrategyTester {
  private engine = new WhatIfEngine();

  generateAutoScenarios(baseState: any): ScenarioResult[] {
    const scenarios: ScenarioInput[] = [
      { ...baseState, avgRevenue: baseState.avgRevenue * 1.1, label: "Price increase 10%" },
      { ...baseState, avgRevenue: baseState.avgRevenue * 1.2, label: "Price increase 20%" },
      { ...baseState, denialRate: baseState.denialRate * 0.5, label: "Denial rate halved" },
      { ...baseState, denialRate: baseState.denialRate * 0.8, label: "Denial rate reduced 20%" },
      { ...baseState, patientsPerDay: baseState.patientsPerDay * 1.2, label: "Volume increase 20%" },
      { ...baseState, patientsPerDay: baseState.patientsPerDay * 1.5, label: "Volume increase 50%" },
      {
        ...baseState,
        patientsPerDay: baseState.patientsPerDay * 1.2,
        denialRate: baseState.denialRate * 0.8,
        label: "Growth + denial reduction combo"
      },
      {
        ...baseState,
        avgRevenue: baseState.avgRevenue * 1.15,
        capacity: Math.min(baseState.capacity * 1.2, 1),
        label: "Premium pricing + capacity expansion"
      }
    ];

    return this.engine.compareScenarios(baseState, scenarios);
  }
}

export const whatIfEngine = new WhatIfEngine();
export const strategyTester = new StrategyTester();
