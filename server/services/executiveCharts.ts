export function buildExecutiveChartSeries(
  snapshots: Array<{
    snapshotDate: string | Date;
    totalCases: string | number;
    overrideRate: string | number;
    avgSatisfaction: string | number;
    avgCostPerCase: string | number;
    avgRevenuePerCase: string | number;
  }>
) {
  const ordered = [...snapshots].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()
  );

  return ordered.map(s => {
    const revenue = Number(s.avgRevenuePerCase);
    const cost = Number(s.avgCostPerCase);
    const marginPct = revenue ? ((revenue - cost) / revenue) * 100 : 0;

    return {
      date: new Date(s.snapshotDate).toISOString().slice(0, 10),
      totalCases: Number(s.totalCases),
      overrideRatePct: Number((Number(s.overrideRate) * 100).toFixed(2)),
      avgSatisfaction: Number(Number(s.avgSatisfaction).toFixed(2)),
      avgCostPerCase: Number(Number(s.avgCostPerCase).toFixed(2)),
      avgRevenuePerCase: Number(Number(s.avgRevenuePerCase).toFixed(2)),
      marginPct: Number(marginPct.toFixed(2)),
    };
  });
}
