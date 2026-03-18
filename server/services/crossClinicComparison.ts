export type ClinicComparisonRow = {
  clinicId: string;
  totalCases: number;
  overrideRate: number;
  avgSatisfaction: number;
  marginPct: number;
  escalationRate: number;
};

export function buildCrossClinicComparison(rows: ClinicComparisonRow[]) {
  return rows
    .map(r => ({
      ...r,
      status:
        r.overrideRate > 0.15 || r.marginPct < 25
          ? "critical"
          : r.overrideRate > 0.08 || r.marginPct < 40
            ? "watch"
            : "good",
    }))
    .sort((a, b) => b.totalCases - a.totalCases);
}

export function getDemoCrossClinicData(): ClinicComparisonRow[] {
  return [
    { clinicId: "clinicA", totalCases: 3200, overrideRate: 0.11, avgSatisfaction: 4.56, marginPct: 41.2, escalationRate: 0.08 },
    { clinicId: "clinicB", totalCases: 2100, overrideRate: 0.07, avgSatisfaction: 4.68, marginPct: 46.5, escalationRate: 0.05 },
    { clinicId: "clinicC", totalCases: 1400, overrideRate: 0.18, avgSatisfaction: 4.02, marginPct: 22.4, escalationRate: 0.16 },
    { clinicId: "clinicD", totalCases: 1800, overrideRate: 0.09, avgSatisfaction: 4.45, marginPct: 38.7, escalationRate: 0.07 },
  ];
}
