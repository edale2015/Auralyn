export type BenchmarkRow = {
  clinicType: string;
  complaint: string;
  accuracy: number;
  overrideRate: number;
  escalationRate: number;
  avgSatisfaction: number;
};

export function buildBenchmarks(rows: BenchmarkRow[]) {
  return rows.map(row => {
    let band: "top" | "middle" | "needs_attention" = "middle";

    if (row.accuracy >= 0.92 && row.overrideRate <= 0.06 && row.escalationRate <= 0.08) {
      band = "top";
    } else if (row.accuracy < 0.8 || row.overrideRate > 0.15 || row.escalationRate > 0.18) {
      band = "needs_attention";
    }

    return {
      ...row,
      accuracyPct: Number((row.accuracy * 100).toFixed(1)),
      overrideRatePct: Number((row.overrideRate * 100).toFixed(1)),
      escalationRatePct: Number((row.escalationRate * 100).toFixed(1)),
      band,
    };
  });
}

export function getDemoBenchmarks(): BenchmarkRow[] {
  return [
    { clinicType: "urgent_care", complaint: "cough", accuracy: 0.93, overrideRate: 0.05, escalationRate: 0.07, avgSatisfaction: 4.7 },
    { clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.78, overrideRate: 0.19, escalationRate: 0.22, avgSatisfaction: 4.0 },
    { clinicType: "virtual_primary_care", complaint: "rash", accuracy: 0.95, overrideRate: 0.04, escalationRate: 0.03, avgSatisfaction: 4.8 },
    { clinicType: "urgent_care", complaint: "chest_pain", accuracy: 0.82, overrideRate: 0.12, escalationRate: 0.14, avgSatisfaction: 4.3 },
    { clinicType: "virtual_primary_care", complaint: "headache", accuracy: 0.91, overrideRate: 0.07, escalationRate: 0.06, avgSatisfaction: 4.6 },
    { clinicType: "pediatrics", complaint: "fever", accuracy: 0.89, overrideRate: 0.08, escalationRate: 0.09, avgSatisfaction: 4.5 },
  ];
}
