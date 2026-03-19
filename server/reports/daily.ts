import { analyzeDisagreements } from "../learning/disagreement";
import { getTrustScores } from "../trust/trustScore";
import { getAllPayerStats } from "../learning/payerRLHFEngine";

export interface DailyReportInput {
  encounters: Array<{
    confidence: number;
    escalated: boolean;
    revenue: number;
    complaint: string;
    autoHandled: boolean;
  }>;
}

export interface DailyReport {
  date: string;
  totalPatients: number;
  avgConfidence: number;
  escalations: number;
  escalationRate: number;
  autoHandled: number;
  autoHandleRate: number;
  revenue: number;
  avgRevenuePerPatient: number;
  topComplaints: Array<{ complaint: string; count: number }>;
  disagreementSummary: ReturnType<typeof analyzeDisagreements>;
  trustScoreSnapshot: Record<string, any>;
  payerPerformance: Record<string, any>;
}

export function generateDailyReport(input: DailyReportInput): DailyReport {
  const { encounters } = input;
  const total = encounters.length;

  const escalations = encounters.filter((e) => e.escalated).length;
  const autoHandled = encounters.filter((e) => e.autoHandled).length;
  const revenue = encounters.reduce((sum, e) => sum + e.revenue, 0);
  const avgConfidence = total > 0 ? Math.round((encounters.reduce((sum, e) => sum + e.confidence, 0) / total) * 100) / 100 : 0;

  const complaintCounts: Record<string, number> = {};
  for (const e of encounters) {
    const c = e.complaint.toLowerCase();
    complaintCounts[c] = (complaintCounts[c] || 0) + 1;
  }
  const topComplaints = Object.entries(complaintCounts)
    .map(([complaint, count]) => ({ complaint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    date: new Date().toISOString().split("T")[0],
    totalPatients: total,
    avgConfidence,
    escalations,
    escalationRate: total > 0 ? Math.round((escalations / total) * 100) : 0,
    autoHandled,
    autoHandleRate: total > 0 ? Math.round((autoHandled / total) * 100) : 0,
    revenue: Math.round(revenue),
    avgRevenuePerPatient: total > 0 ? Math.round(revenue / total) : 0,
    topComplaints,
    disagreementSummary: analyzeDisagreements(),
    trustScoreSnapshot: getTrustScores(),
    payerPerformance: getAllPayerStats(),
  };
}
