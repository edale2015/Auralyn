export type PortfolioClinicRow = {
  clinicId: string;
  totalCases: number;
  marginPct: number;
  overrideRate: number;
  satisfaction: number;
};

export function buildClinicPortfolio(rows: PortfolioClinicRow[]) {
  const totalCases = rows.reduce((sum, r) => sum + r.totalCases, 0);
  const avgMargin = rows.reduce((sum, r) => sum + r.marginPct, 0) / Math.max(1, rows.length);
  const avgOverrideRate = rows.reduce((sum, r) => sum + r.overrideRate, 0) / Math.max(1, rows.length);
  const avgSatisfaction = rows.reduce((sum, r) => sum + r.satisfaction, 0) / Math.max(1, rows.length);

  return {
    totalClinics: rows.length,
    totalCases,
    avgMargin: Number(avgMargin.toFixed(2)),
    avgOverrideRate: Number((avgOverrideRate * 100).toFixed(2)),
    avgSatisfaction: Number(avgSatisfaction.toFixed(2)),
    clinics: rows
  };
}
