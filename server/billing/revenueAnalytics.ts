import { getClaimOutcomeStats, getOutcomeLog } from "./claimOutcomeLearning";

const CPT_PRICING: Record<string, number> = {
  "99213": 75,
  "99203": 90,
  "99214": 110,
  "99215": 150,
  "99284": 250,
  "99285": 400,
  "99441": 40,
  "99443": 85,
};

export interface RevenueMetrics {
  totalEncounters: number;
  totalRevenue: number;
  projectedRevenue: number;
  denialRate: number;
  avgRevenuePerEncounter: number;
  revenueLostToDenials: number;
  topDeniedCodePairs: Array<{ key: string; denials: number; potentialLoss: number }>;
  cptBreakdown: Array<{ cpt: string; count: number; revenue: number; unitPrice: number }>;
}

export function calculateRevenueMetrics(): RevenueMetrics {
  const stats = getClaimOutcomeStats();
  const log = getOutcomeLog(10000);

  const cptCounts: Record<string, { count: number; revenue: number }> = {};
  for (const entry of log) {
    if (!cptCounts[entry.cptCode]) cptCounts[entry.cptCode] = { count: 0, revenue: 0 };
    cptCounts[entry.cptCode].count++;
    if (entry.paid) cptCounts[entry.cptCode].revenue += entry.revenueAmount;
  }

  const cptBreakdown = Object.entries(cptCounts).map(([cpt, data]) => ({
    cpt,
    count: data.count,
    revenue: Math.round(data.revenue * 100) / 100,
    unitPrice: CPT_PRICING[cpt] || 75,
  }));

  const topDenied = stats.codePairWeights
    .filter((w) => w.denied > 0)
    .sort((a, b) => b.denied - a.denied)
    .slice(0, 10)
    .map((w) => {
      const cpt = w.key.split("_")[1] || "99213";
      return {
        key: w.key,
        denials: w.denied,
        potentialLoss: w.denied * (CPT_PRICING[cpt] || 75),
      };
    });

  const projectedMonthly = stats.totalOutcomes > 0
    ? Math.round((stats.totalRevenue / stats.totalOutcomes) * 30 * 50)
    : 0;

  const revenueLost = log
    .filter((o) => !o.paid)
    .reduce((sum, o) => sum + (CPT_PRICING[o.cptCode] || 75), 0);

  return {
    totalEncounters: stats.totalOutcomes,
    totalRevenue: stats.totalRevenue,
    projectedRevenue: projectedMonthly,
    denialRate: stats.denialRate,
    avgRevenuePerEncounter: stats.totalOutcomes > 0
      ? Math.round((stats.totalRevenue / stats.totalOutcomes) * 100) / 100
      : 0,
    revenueLostToDenials: Math.round(revenueLost * 100) / 100,
    topDeniedCodePairs: topDenied,
    cptBreakdown,
  };
}
