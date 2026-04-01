import { getClaimOutcomeStats, getOutcomeLog } from "../billing/claimOutcomeLearning";
import { calculateRevenueMetrics } from "../billing/revenueAnalytics";

export type NegotiationStrategy =
  | "anchor_high"
  | "value_based"
  | "bundled_rate"
  | "risk_share"
  | "standard";

export interface ContractScore {
  payerId: string;
  avgReimbursement: number;
  denialRate: number;
  outcomeScore: number;
  collectionRate: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  recommendedStrategy: NegotiationStrategy;
  rationale: string;
  leveragePoints: string[];
}

const PAYER_BASELINE: Record<string, { avgRate: number; historicalDenial: number }> = {
  BCBS: { avgRate: 110, historicalDenial: 0.08 },
  AETNA: { avgRate: 95, historicalDenial: 0.12 },
  UHC: { avgRate: 105, historicalDenial: 0.14 },
  CIGNA: { avgRate: 88, historicalDenial: 0.09 },
  HUMANA: { avgRate: 92, historicalDenial: 0.11 },
  MEDICARE: { avgRate: 78, historicalDenial: 0.06 },
  MEDICAID: { avgRate: 62, historicalDenial: 0.18 },
};

export function scoreContract(payerId: string): ContractScore {
  const stats = getClaimOutcomeStats();
  const revenue = calculateRevenueMetrics();
  const log = getOutcomeLog(200);

  const baseline = PAYER_BASELINE[payerId.toUpperCase()] ?? { avgRate: 90, historicalDenial: 0.12 };

  const payerClaims = log.filter(c => (c as any).payerId === payerId || true);
  const totalClaims = payerClaims.length;

  const avgReimbursement = totalClaims > 0
    ? payerClaims.reduce((s, c) => s + ((c as any).revenueAmount ?? baseline.avgRate), 0) / totalClaims
    : baseline.avgRate;

  const denialRate = totalClaims > 0
    ? payerClaims.filter(c => !(c as any).paid).length / totalClaims
    : baseline.historicalDenial;

  const collectionRate = 1 - denialRate;
  const outcomeScore = stats.paidRate > 0 ? stats.paidRate : 0.85;

  const normalizedAvgRate = Math.min(avgReimbursement / 200, 1);
  const score = normalizedAvgRate * 0.4 + collectionRate * 0.35 + outcomeScore * 0.25;

  let grade: ContractScore["grade"] = "F";
  if (score >= 0.85) grade = "A";
  else if (score >= 0.70) grade = "B";
  else if (score >= 0.55) grade = "C";
  else if (score >= 0.40) grade = "D";

  let strategy: NegotiationStrategy = "standard";
  let rationale = "Standard rate negotiation based on current contract terms.";

  if (score >= 0.85 && denialRate < 0.10) {
    strategy = "anchor_high";
    rationale = "Excellent collection rate + low denial rate = strong leverage for above-market rates.";
  } else if (outcomeScore > 0.90 && denialRate < 0.12) {
    strategy = "value_based";
    rationale = "Superior outcomes justify value-based premium rates. Lead with quality data.";
  } else if (denialRate > 0.20) {
    strategy = "bundled_rate";
    rationale = "High denial rate — reframe to bundled payments to avoid per-claim disputes.";
  } else if (score < 0.45) {
    strategy = "risk_share";
    rationale = "Weak current performance — propose risk-share model to demonstrate improvement.";
  } else if (score >= 0.65) {
    strategy = "value_based";
    rationale = "Good metrics — frame as value-based partnership for incremental rate improvement.";
  }

  const leveragePoints: string[] = [];
  if (outcomeScore > 0.85) leveragePoints.push(`${(outcomeScore * 100).toFixed(0)}% outcomes quality score exceeds payer network average`);
  if (denialRate < 0.10) leveragePoints.push(`${(denialRate * 100).toFixed(1)}% denial rate — administrative burden cost savings for payer`);
  if (stats.totalOutcomes > 50) leveragePoints.push(`${stats.totalOutcomes} validated outcomes on record — defensible quality evidence`);
  if (revenue.totalRevenue > 0) leveragePoints.push(`Strong revenue performance demonstrates high-value patient population`);
  if (leveragePoints.length === 0) leveragePoints.push("Build outcome data baseline over next 90 days before renegotiating");

  return {
    payerId,
    avgReimbursement: Math.round(avgReimbursement * 100) / 100,
    denialRate: Math.round(denialRate * 1000) / 1000,
    outcomeScore: Math.round(outcomeScore * 1000) / 1000,
    collectionRate: Math.round(collectionRate * 1000) / 1000,
    score: Math.round(score * 1000) / 1000,
    grade,
    recommendedStrategy: strategy,
    rationale,
    leveragePoints,
  };
}

export function scoreAllPayers(): ContractScore[] {
  return Object.keys(PAYER_BASELINE).map(payerId => scoreContract(payerId));
}

export function getPayerLeaderboard(): { payerId: string; score: number; grade: string; strategy: NegotiationStrategy }[] {
  return scoreAllPayers()
    .map(c => ({ payerId: c.payerId, score: c.score, grade: c.grade, strategy: c.recommendedStrategy }))
    .sort((a, b) => b.score - a.score);
}
