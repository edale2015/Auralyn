/**
 * Payer Optimization Engine
 * Analyzes claim history per payer to surface approval rates, average revenue,
 * and contract negotiation opportunities.
 */

export interface Claim {
  id?: string;
  payer: string;
  cpt: string;
  icd10?: string;
  approved: boolean;
  reimbursement: number;
  denialReason?: string;
  submittedAt?: string;
}

export interface PayerStats {
  payer: string;
  totalClaims: number;
  approvedClaims: number;
  deniedClaims: number;
  approvalRate: number;
  totalRevenue: number;
  avgRevenue: number;
  topDenialReasons: string[];
  revenuePotential: number;  // if approval rate were 100%
}

export function optimizePayerStrategy(claims: Claim[]): PayerStats[] {
  const byPayer = new Map<string, { approved: Claim[]; denied: Claim[] }>();

  for (const c of claims) {
    if (!byPayer.has(c.payer)) byPayer.set(c.payer, { approved: [], denied: [] });
    if (c.approved) byPayer.get(c.payer)!.approved.push(c);
    else             byPayer.get(c.payer)!.denied.push(c);
  }

  return Array.from(byPayer.entries()).map(([payer, { approved, denied }]) => {
    const total        = approved.length + denied.length;
    const totalRevenue = approved.reduce((s, c) => s + c.reimbursement, 0);
    const avgRevenue   = total > 0 ? totalRevenue / total : 0;
    const avgClaim     = approved.length > 0 ? totalRevenue / approved.length : 0;
    const denialReasonCounts = denied
      .map(c => c.denialReason ?? "Unknown")
      .reduce<Record<string, number>>((acc, r) => { acc[r] = (acc[r] ?? 0) + 1; return acc; }, {});
    const topDenialReasons = Object.entries(denialReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason]) => reason);

    return {
      payer,
      totalClaims:    total,
      approvedClaims: approved.length,
      deniedClaims:   denied.length,
      approvalRate:   total > 0 ? approved.length / total : 0,
      totalRevenue,
      avgRevenue,
      topDenialReasons,
      revenuePotential: total * avgClaim,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);
}
