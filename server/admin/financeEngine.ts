export interface EncounterFinancials {
  encounterId: string;
  status: "APPROVED" | "DENIED" | "PENDING";
  amount: number;
}

export interface FinancialSummary {
  totalEncounters: number;
  approvedCount: number;
  deniedCount: number;
  pendingCount: number;
  approvalRate: number;
  denialRate: number;
  totalRevenue: number;
  avgPerEncounter: number;
  projectedMonthly: number;
}

export function computeFinancials(
  encounters: { id?: string }[],
  claims: EncounterFinancials[],
): FinancialSummary {
  const total    = Math.max(encounters.length, 1);
  const approved = claims.filter((c) => c.status === "APPROVED").length;
  const denied   = claims.filter((c) => c.status === "DENIED").length;
  const pending  = claims.filter((c) => c.status === "PENDING").length;
  const revenue  = claims.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  return {
    totalEncounters:   total,
    approvedCount:     approved,
    deniedCount:       denied,
    pendingCount:      pending,
    approvalRate:      +((approved / total) * 100).toFixed(1),
    denialRate:        +((denied / total) * 100).toFixed(1),
    totalRevenue:      +revenue.toFixed(2),
    avgPerEncounter:   +(revenue / total).toFixed(2),
    projectedMonthly:  +(revenue * (30 / Math.max(7, 1))).toFixed(2),
  };
}

export function getDemoFinancials(): FinancialSummary {
  return computeFinancials(
    Array.from({ length: 312 }, (_, i) => ({ id: `ENC-${i}` })),
    [
      ...Array.from({ length: 271 }, () => ({ encounterId: "x", status: "APPROVED" as const, amount: 185 + Math.random() * 60 })),
      ...Array.from({ length:  28 }, () => ({ encounterId: "x", status: "DENIED"   as const, amount: 0 })),
      ...Array.from({ length:  13 }, () => ({ encounterId: "x", status: "PENDING"  as const, amount: 150 })),
    ],
  );
}

export function getFinanceEngineStats() {
  return { active: true, demoAvgRevenuePerEncounter: 197 };
}
