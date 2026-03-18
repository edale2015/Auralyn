export type BenchmarkTrendPoint = {
  date: string;
  clinicType: string;
  complaint: string;
  accuracy: number;
  overrideRate: number;
  escalationRate: number;
};

export function buildBenchmarkTrendSeries(rows: BenchmarkTrendPoint[]) {
  return rows.map((r) => ({
    ...r,
    accuracyPct: Number((r.accuracy * 100).toFixed(2)),
    overrideRatePct: Number((r.overrideRate * 100).toFixed(2)),
    escalationRatePct: Number((r.escalationRate * 100).toFixed(2)),
  }));
}
