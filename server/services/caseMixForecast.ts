export type HistoricalCaseMixRow = {
  date: string;
  complaint: string;
  count: number;
  avgRiskScore: number;
};

export type CaseMixForecastRow = {
  complaint: string;
  forecastCount: number;
  forecastAvgRiskScore: number;
  recommendedStaffingWeight: number;
};

export function buildCaseMixForecast(
  rows: HistoricalCaseMixRow[]
): CaseMixForecastRow[] {
  const map: Record<string, { totalCount: number; totalRisk: number; days: number }> = {};

  for (const row of rows) {
    if (!map[row.complaint]) {
      map[row.complaint] = { totalCount: 0, totalRisk: 0, days: 0 };
    }

    map[row.complaint].totalCount += row.count;
    map[row.complaint].totalRisk += row.avgRiskScore;
    map[row.complaint].days += 1;
  }

  return Object.entries(map).map(([complaint, v]) => {
    const forecastCount = v.days ? v.totalCount / v.days : 0;
    const forecastAvgRiskScore = v.days ? v.totalRisk / v.days : 0;
    const recommendedStaffingWeight = forecastCount * (1 + forecastAvgRiskScore / 10);

    return {
      complaint,
      forecastCount: Number(forecastCount.toFixed(1)),
      forecastAvgRiskScore: Number(forecastAvgRiskScore.toFixed(2)),
      recommendedStaffingWeight: Number(recommendedStaffingWeight.toFixed(2))
    };
  }).sort((a, b) => b.recommendedStaffingWeight - a.recommendedStaffingWeight);
}
