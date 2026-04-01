import { computeHEDISMetrics, HEDISReport } from "./hedisEngine";
import { getClaimOutcomeStats } from "../billing/claimOutcomeLearning";
import { calculateRevenueMetrics } from "../billing/revenueAnalytics";

export interface QualityReport {
  reportId: string;
  generatedAt: string;
  reportType: "HEDIS" | "FDA" | "PAYER" | "COMPREHENSIVE";
  version: string;
  summary: {
    overallScore: number;
    overallGrade: string;
    totalEncounters: number;
    claimApprovalRate: number;
    denialRate: number;
    totalRevenue: number;
    qualityAdjustedRevenue: number;
  };
  hedis: HEDISReport;
  revenueMetrics: ReturnType<typeof calculateRevenueMetrics>;
  claimStats: ReturnType<typeof getClaimOutcomeStats>;
  narrativeSummary: string;
  contractLeverage: string[];
  fdaFlags: string[];
}

export async function generateQualityReport(reportType: "HEDIS" | "FDA" | "PAYER" | "COMPREHENSIVE" = "COMPREHENSIVE"): Promise<QualityReport> {
  const hedis = await computeHEDISMetrics();
  const revenueMetrics = calculateRevenueMetrics();
  const claimStats = getClaimOutcomeStats();

  const reportId = `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const denialRate = revenueMetrics.denialRate ?? claimStats.denialRate ?? 0;
  const claimApprovalRate = 1 - denialRate;
  const qualityAdjustedRevenue = Math.round(revenueMetrics.totalRevenue * claimApprovalRate);

  const contractLeverage: string[] = [];
  if (hedis.overallScore >= 0.85) contractLeverage.push(`HEDIS composite score of ${(hedis.overallScore * 100).toFixed(1)}% exceeds industry average — use as primary negotiation anchor`);
  if (denialRate < 0.10) contractLeverage.push(`${(denialRate * 100).toFixed(1)}% denial rate (industry avg 12%) — demonstrate administrative efficiency to payer`);
  if (claimStats.totalOutcomes > 50) contractLeverage.push(`${claimStats.totalOutcomes} validated outcomes — evidence-based quality data supports premium contract rates`);
  if (revenueMetrics.totalEncounters > 100) contractLeverage.push(`${revenueMetrics.totalEncounters} encounters — sufficient volume for meaningful risk stratification`);

  const fdaFlags: string[] = [];
  hedis.metrics.forEach(m => {
    if (m.status === "below") {
      fdaFlags.push(`[FLAG] ${m.name}: ${(m.rate * 100).toFixed(1)}% — below HEDIS benchmark of ${(m.benchmark * 100).toFixed(0)}%`);
    }
  });
  if (fdaFlags.length === 0) fdaFlags.push("[PASS] All monitored quality indicators meeting or exceeding benchmark thresholds");

  const scoreVerb = hedis.overallGrade === "A+" || hedis.overallGrade === "A" ? "excellent" : hedis.overallGrade === "B" ? "good" : "developing";
  const narrativeSummary = `This ${reportType} quality report covers ${hedis.totalEncounters} clinical encounters with an overall HEDIS composite score of ${(hedis.overallScore * 100).toFixed(1)}% (Grade ${hedis.overallGrade}). Performance is ${scoreVerb} with ${hedis.metrics.filter(m => m.status === "exceeds").length} metrics exceeding benchmarks and ${hedis.metrics.filter(m => m.status === "below").length} requiring attention. Claim approval rate stands at ${(claimApprovalRate * 100).toFixed(1)}%, with quality-adjusted revenue of $${qualityAdjustedRevenue.toLocaleString()}.`;

  return {
    reportId,
    generatedAt: new Date().toISOString(),
    reportType,
    version: "2.0",
    summary: {
      overallScore: hedis.overallScore,
      overallGrade: hedis.overallGrade,
      totalEncounters: hedis.totalEncounters,
      claimApprovalRate: Math.round(claimApprovalRate * 1000) / 1000,
      denialRate: Math.round(denialRate * 1000) / 1000,
      totalRevenue: revenueMetrics.totalRevenue,
      qualityAdjustedRevenue,
    },
    hedis,
    revenueMetrics,
    claimStats,
    narrativeSummary,
    contractLeverage,
    fdaFlags,
  };
}
