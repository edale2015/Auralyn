import { logMetric } from "../monitoring/metrics";

export interface RevenueCase {
  caseId: string;
  patientId?: string;
  revenue: number;
  icd10?: string;
  cpt?: string;
  paidAt?: string;
  payer?: string;
  denied?: boolean;
}

const revenueLog: RevenueCase[] = [];

export function trackCase(c: RevenueCase): void {
  revenueLog.push(c);
  logMetric("revenue.case", c.revenue, "outcome", { caseId: c.caseId });
}

export function calculateRevenue(cases: RevenueCase[] = revenueLog): number {
  return cases.reduce((sum, c) => sum + c.revenue, 0);
}

export function getRevenueSummary(windowSize = 100): {
  total: number;
  average: number;
  denialRate: number;
  topCpt: string;
  caseCount: number;
  byPayer: Record<string, number>;
} {
  const recent = revenueLog.slice(-windowSize);
  const total = calculateRevenue(recent);
  const denied = recent.filter(c => c.denied).length;
  const byPayer: Record<string, number> = {};
  const cptCounts: Record<string, number> = {};

  for (const c of recent) {
    if (c.payer) byPayer[c.payer] = (byPayer[c.payer] ?? 0) + c.revenue;
    if (c.cpt) cptCounts[c.cpt] = (cptCounts[c.cpt] ?? 0) + 1;
  }

  const topCpt = Object.entries(cptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "99213";

  return {
    total,
    average: recent.length ? total / recent.length : 0,
    denialRate: recent.length ? denied / recent.length : 0,
    topCpt,
    caseCount: recent.length,
    byPayer,
  };
}

export function getRevenueLog(limit = 20): RevenueCase[] {
  return revenueLog.slice(-limit);
}
