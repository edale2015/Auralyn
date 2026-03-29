export interface EncounterFinancials {
  encounterId:  string;
  status:       "APPROVED" | "DENIED" | "PENDING";
  amount:       number;
  dateOfService?:string;
}

export interface FinancialSummary {
  totalEncounters:   number;
  approvedCount:     number;
  deniedCount:       number;
  pendingCount:      number;
  approvalRate:      number;
  denialRate:        number;
  totalRevenue:      number;
  avgPerEncounter:   number;
  projectedMonthly:  number;
  periodDays:        number;
}

export function computeFinancials(
  encounters: { id?: string; dateOfService?: string }[],
  claims: EncounterFinancials[],
  periodDays?: number,
): FinancialSummary {
  const total    = Math.max(encounters.length, 1);
  const approved = claims.filter((c) => c.status === "APPROVED").length;
  const denied   = claims.filter((c) => c.status === "DENIED").length;
  const pending  = claims.filter((c) => c.status === "PENDING").length;
  const revenue  = claims.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  // Compute actual period from date range if no periodDays provided
  let actualPeriodDays = periodDays ?? 30;
  if (!periodDays && claims.length > 0) {
    const dates = claims
      .filter((c) => c.dateOfService)
      .map((c) => new Date(c.dateOfService!).getTime())
      .filter((t) => !isNaN(t));
    if (dates.length >= 2) {
      const spanMs = Math.max(...dates) - Math.min(...dates);
      actualPeriodDays = Math.max(1, Math.ceil(spanMs / (1000 * 60 * 60 * 24)));
    }
  }

  const projectedMonthly = actualPeriodDays > 0
    ? +(revenue * (30 / actualPeriodDays)).toFixed(2)
    : +revenue.toFixed(2);

  return {
    totalEncounters:   total,
    approvedCount:     approved,
    deniedCount:       denied,
    pendingCount:      pending,
    approvalRate:      +((approved / total) * 100).toFixed(1),
    denialRate:        +((denied / total) * 100).toFixed(1),
    totalRevenue:      +revenue.toFixed(2),
    avgPerEncounter:   +(revenue / total).toFixed(2),
    projectedMonthly,
    periodDays:        actualPeriodDays,
  };
}

export function getDemoFinancials(): FinancialSummary {
  // 30-day period, 312 encounters
  const now = Date.now();
  const demoClaims: EncounterFinancials[] = [
    ...Array.from({ length: 271 }, (_, i) => ({
      encounterId: `ENC-${i}`,
      status: "APPROVED" as const,
      amount: 185 + Math.random() * 60,
      dateOfService: new Date(now - Math.random() * 30 * 86400000).toISOString(),
    })),
    ...Array.from({ length: 28 }, (_, i) => ({
      encounterId: `ENC-D-${i}`,
      status: "DENIED" as const,
      amount: 0,
      dateOfService: new Date(now - Math.random() * 30 * 86400000).toISOString(),
    })),
    ...Array.from({ length: 13 }, (_, i) => ({
      encounterId: `ENC-P-${i}`,
      status: "PENDING" as const,
      amount: 150,
      dateOfService: new Date(now - Math.random() * 5 * 86400000).toISOString(),
    })),
  ];
  return computeFinancials(
    Array.from({ length: 312 }, (_, i) => ({ id: `ENC-${i}` })),
    demoClaims,
    30,
  );
}

export function getFinanceEngineStats() {
  return { active: true, demoAvgRevenuePerEncounter: 197 };
}
