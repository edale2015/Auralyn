export type CostCaseRow = {
  caseId: string;
  clinicId: string;
  reviewSeconds: number;
  escalated: boolean;
  physicianHourlyCost: number;
  platformCost: number;
};

export function computeCostPerCase(rows: CostCaseRow[]) {
  const enriched = rows.map((r) => {
    const physicianCost = (r.reviewSeconds / 3600) * r.physicianHourlyCost;
    const escalationPenalty = r.escalated ? 8 : 0;
    const totalCost = physicianCost + r.platformCost + escalationPenalty;
    return { ...r, physicianCost: Number(physicianCost.toFixed(2)), escalationPenalty, totalCost: Number(totalCost.toFixed(2)) };
  });
  const avgCost = enriched.reduce((sum, r) => sum + r.totalCost, 0) / Math.max(1, enriched.length);
  return { averageCostPerCase: Number(avgCost.toFixed(2)), cases: enriched };
}

export function recommendCostAction(avgCostPerCase: number) {
  if (avgCostPerCase > 12) return "Increase batch approvals for low-risk cases and review escalation rules";
  if (avgCostPerCase > 7) return "Moderate cost. Optimize physician assignment and review speed";
  return "Cost profile healthy";
}

const seededCostRows: CostCaseRow[] = [
  { caseId: "intake-001", clinicId: "clinic_a", reviewSeconds: 0, escalated: false, physicianHourlyCost: 180, platformCost: 1.8 },
  { caseId: "intake-002", clinicId: "clinic_a", reviewSeconds: 14, escalated: false, physicianHourlyCost: 180, platformCost: 1.8 },
  { caseId: "intake-003", clinicId: "clinic_a", reviewSeconds: 12, escalated: false, physicianHourlyCost: 180, platformCost: 1.8 },
  { caseId: "intake-004", clinicId: "clinic_b", reviewSeconds: 45, escalated: true, physicianHourlyCost: 200, platformCost: 2.0 },
  { caseId: "intake-005", clinicId: "clinic_a", reviewSeconds: 18, escalated: false, physicianHourlyCost: 180, platformCost: 1.8 },
  { caseId: "intake-006", clinicId: "clinic_a", reviewSeconds: 0, escalated: false, physicianHourlyCost: 180, platformCost: 1.8 },
  { caseId: "intake-007", clinicId: "clinic_b", reviewSeconds: 35, escalated: true, physicianHourlyCost: 200, platformCost: 2.0 },
  { caseId: "intake-008", clinicId: "clinic_a", reviewSeconds: 20, escalated: false, physicianHourlyCost: 180, platformCost: 1.8 },
];

export function getSeededCostAnalysis() {
  const result = computeCostPerCase(seededCostRows);
  return { ...result, recommendation: recommendCostAction(result.averageCostPerCase) };
}
