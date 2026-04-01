import { calculateRevenueMetrics } from "../billing/revenueAnalytics";
import { getClaimOutcomeStats, getOutcomeLog } from "../billing/claimOutcomeLearning";
import { scoreAllPayers } from "../insurer/contractEngine";

export interface OutcomeWeightedRevenue {
  timestamp: string;
  totalRevenue: number;
  qualityAdjustedRevenue: number;
  weightedRevenue: number;
  outcomeEfficiencyScore: number;
  denialRate: number;
  paidRate: number;
  totalEncounters: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  gradeColor: "emerald" | "green" | "yellow" | "orange" | "red";
  revenueLostToDenials: number;
  potentialRecovery: number;
  topOpportunities: {
    key: string;
    denials: number;
    potentialLoss: number;
    recoveryPotential: number;
    priority: "high" | "medium" | "low";
  }[];
  payerPerformance: {
    payerId: string;
    score: number;
    grade: string;
    strategy: string;
    avgReimbursement: number;
    collectionRate: number;
  }[];
  revenueByPayer: {
    payerId: string;
    estimatedRevenue: number;
    denialRate: number;
    revenueAtRisk: number;
  }[];
  kpis: {
    name: string;
    value: string;
    trend: "up" | "down" | "stable";
    color: "green" | "yellow" | "red";
    insight: string;
  }[];
}

export function computeOutcomeWeightedRevenue(): OutcomeWeightedRevenue {
  const revenue = calculateRevenueMetrics();
  const stats = getClaimOutcomeStats();
  const log = getOutcomeLog(500);

  const qualityWeight = stats.paidRate > 0 ? stats.paidRate : 0.88;
  const qualityAdjustedRevenue = Math.round(revenue.totalRevenue * qualityWeight);

  const outcomeEfficiencyScore = revenue.totalRevenue > 0
    ? Math.round((qualityAdjustedRevenue / revenue.totalRevenue) * 1000) / 10
    : 88.0;

  const denialRate = revenue.denialRate ?? stats.denialRate ?? 0.09;
  const paidRate = Math.round((1 - denialRate) * 1000) / 10;

  const revenueLostToDenials = revenue.revenueLostToDenials ?? Math.round(revenue.totalRevenue * denialRate);
  const potentialRecovery = Math.round(revenueLostToDenials * 0.65);

  let grade: OutcomeWeightedRevenue["grade"] = "F";
  let gradeColor: OutcomeWeightedRevenue["gradeColor"] = "red";
  if (denialRate < 0.05) { grade = "A+"; gradeColor = "emerald"; }
  else if (denialRate < 0.08) { grade = "A"; gradeColor = "green"; }
  else if (denialRate < 0.12) { grade = "B"; gradeColor = "yellow"; }
  else if (denialRate < 0.18) { grade = "C"; gradeColor = "orange"; }
  else if (denialRate < 0.25) { grade = "D"; gradeColor = "red"; }

  const topOpportunities = (revenue.topDeniedCodePairs ?? []).slice(0, 6).map(p => ({
    key: p.key,
    denials: p.denials,
    potentialLoss: p.potentialLoss,
    recoveryPotential: Math.round(p.potentialLoss * 0.65 * (1 - denialRate)),
    priority: p.denials > 5 ? "high" as const : p.denials > 2 ? "medium" as const : "low" as const,
  }));

  const payerScores = scoreAllPayers();
  const payerPerformance = payerScores.map(p => ({
    payerId: p.payerId,
    score: p.score,
    grade: p.grade,
    strategy: p.recommendedStrategy,
    avgReimbursement: p.avgReimbursement,
    collectionRate: p.collectionRate,
  }));

  const PAYER_VISIT_VOLUMES: Record<string, number> = {
    BCBS: 2400, AETNA: 1800, UHC: 3200, CIGNA: 1200, HUMANA: 950, MEDICARE: 800, MEDICAID: 600,
  };

  const revenueByPayer = payerScores.map(p => {
    const vol = PAYER_VISIT_VOLUMES[p.payerId] ?? 500;
    const estimated = Math.round(p.avgReimbursement * vol * p.collectionRate);
    const atRisk = Math.round(estimated * p.denialRate);
    return {
      payerId: p.payerId,
      estimatedRevenue: estimated,
      denialRate: p.denialRate,
      revenueAtRisk: atRisk,
    };
  }).sort((a, b) => b.estimatedRevenue - a.estimatedRevenue);

  const kpis = [
    {
      name: "Revenue Health Grade",
      value: grade,
      trend: denialRate < 0.10 ? "up" as const : "stable" as const,
      color: denialRate < 0.10 ? "green" as const : denialRate < 0.15 ? "yellow" as const : "red" as const,
      insight: `${(denialRate * 100).toFixed(1)}% denial rate — ${denialRate < 0.10 ? "excellent" : denialRate < 0.15 ? "above average" : "needs improvement"}`,
    },
    {
      name: "Quality-Adjusted Revenue",
      value: `$${qualityAdjustedRevenue.toLocaleString()}`,
      trend: qualityWeight > 0.88 ? "up" as const : "stable" as const,
      color: qualityWeight > 0.88 ? "green" as const : "yellow" as const,
      insight: `${(qualityWeight * 100).toFixed(1)}% outcome quality weight applied to gross revenue`,
    },
    {
      name: "Recovery Opportunity",
      value: `$${potentialRecovery.toLocaleString()}`,
      trend: potentialRecovery > 5000 ? "up" as const : "stable" as const,
      color: potentialRecovery > 10000 ? "red" as const : potentialRecovery > 5000 ? "yellow" as const : "green" as const,
      insight: `65% estimated recovery rate on $${revenueLostToDenials.toLocaleString()} denied revenue`,
    },
    {
      name: "Top Payer ROI",
      value: payerPerformance[0]?.payerId ?? "N/A",
      trend: "stable" as const,
      color: "green" as const,
      insight: `${payerPerformance[0]?.payerId ?? "N/A"} recommended for ${payerPerformance[0]?.strategy ?? "standard"} strategy`,
    },
  ];

  return {
    timestamp: new Date().toISOString(),
    totalRevenue: revenue.totalRevenue,
    qualityAdjustedRevenue,
    weightedRevenue: qualityAdjustedRevenue,
    outcomeEfficiencyScore,
    denialRate: Math.round(denialRate * 1000) / 10,
    paidRate,
    totalEncounters: revenue.totalEncounters,
    grade,
    gradeColor,
    revenueLostToDenials,
    potentialRecovery,
    topOpportunities,
    payerPerformance,
    revenueByPayer,
    kpis,
  };
}
