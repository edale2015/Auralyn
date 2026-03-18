export type RoutingOutcomeRow = {
  physicianId: string;
  complaint: string;
  wasCorrect: boolean;
  escalated: boolean;
  override: boolean;
};

export type ReinforcementWeight = {
  physicianId: string;
  complaint: string;
  weightAdjustment: number;
  reason: string;
};

export function buildRoutingReinforcement(
  rows: RoutingOutcomeRow[]
): ReinforcementWeight[] {
  const map: Record<string, { total: number; correct: number; escalated: number; overrides: number }> = {};

  for (const row of rows) {
    const key = `${row.physicianId}::${row.complaint}`;
    if (!map[key]) {
      map[key] = { total: 0, correct: 0, escalated: 0, overrides: 0 };
    }

    map[key].total += 1;
    if (row.wasCorrect) map[key].correct += 1;
    if (row.escalated) map[key].escalated += 1;
    if (row.override) map[key].overrides += 1;
  }

  return Object.entries(map).map(([key, v]) => {
    const [physicianId, complaint] = key.split("::");
    const accuracy = v.total ? v.correct / v.total : 0;
    const escalationRate = v.total ? v.escalated / v.total : 0;
    const overrideRate = v.total ? v.overrides / v.total : 0;

    let weightAdjustment = 0;
    let reason = "Stable";

    if (accuracy >= 0.92 && escalationRate < 0.08 && overrideRate < 0.08) {
      weightAdjustment = 0.15;
      reason = "Promote routing for this physician-complaint pair";
    } else if (accuracy < 0.75 || escalationRate > 0.2 || overrideRate > 0.18) {
      weightAdjustment = -0.2;
      reason = "Reduce routing weight and require closer supervision";
    } else if (accuracy < 0.85) {
      weightAdjustment = -0.08;
      reason = "Slightly reduce routing weight pending review";
    }

    return {
      physicianId,
      complaint,
      weightAdjustment: Number(weightAdjustment.toFixed(3)),
      reason
    };
  });
}
