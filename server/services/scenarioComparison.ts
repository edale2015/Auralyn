export type ScenarioResult = {
  name: string;
  accuracy: number;
  costPerCase: number;
  overrideRate: number;
};

export function compareScenarios(rows: ScenarioResult[]) {
  const bestAccuracy = [...rows].sort((a, b) => b.accuracy - a.accuracy)[0];
  const bestCost = [...rows].sort((a, b) => a.costPerCase - b.costPerCase)[0];
  const bestOverride = [...rows].sort((a, b) => a.overrideRate - b.overrideRate)[0];

  return {
    bestAccuracy,
    bestCost,
    bestOverride,
    scenarios: rows
  };
}
