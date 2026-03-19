export interface ClaimOutcome {
  encounterId: string;
  icd10: string;
  cptCode: string;
  paid: boolean;
  revenueAmount: number;
  denialReasons?: string[];
  timestamp: string;
}

interface WeightEntry {
  weight: number;
  totalClaims: number;
  paidClaims: number;
  deniedClaims: number;
  totalRevenue: number;
  lastUpdated: string;
}

const weights: Map<string, WeightEntry> = new Map();
const outcomeLog: ClaimOutcome[] = [];

function makeKey(icd10: string, cpt: string): string {
  return `${icd10}_${cpt}`;
}

export function logClaimOutcome(outcome: ClaimOutcome): WeightEntry {
  outcomeLog.push(outcome);

  const key = makeKey(outcome.icd10, outcome.cptCode);
  let entry = weights.get(key);
  if (!entry) {
    entry = { weight: 0.5, totalClaims: 0, paidClaims: 0, deniedClaims: 0, totalRevenue: 0, lastUpdated: "" };
  }

  entry.totalClaims++;
  if (outcome.paid) {
    entry.paidClaims++;
    const reward = Math.min(outcome.revenueAmount / 500, 0.2);
    entry.weight = Math.min(1, entry.weight + 0.1 * reward);
    entry.totalRevenue += outcome.revenueAmount;
  } else {
    entry.deniedClaims++;
    entry.weight = Math.max(0, entry.weight - 0.15);
  }
  entry.lastUpdated = outcome.timestamp;

  weights.set(key, entry);
  return entry;
}

export function getLearnedDenialScore(icd10: string, cpt: string): number {
  const key = makeKey(icd10, cpt);
  const entry = weights.get(key);
  if (!entry) return 0.3;
  return Math.round((1 - entry.weight) * 1000) / 1000;
}

export function getClaimOutcomeStats(): {
  totalOutcomes: number;
  totalPaid: number;
  totalDenied: number;
  totalRevenue: number;
  denialRate: number;
  codePairWeights: Array<{ key: string; weight: number; total: number; paid: number; denied: number }>;
} {
  const totalOutcomes = outcomeLog.length;
  const totalPaid = outcomeLog.filter((o) => o.paid).length;
  const totalDenied = totalOutcomes - totalPaid;
  const totalRevenue = outcomeLog.reduce((s, o) => s + (o.paid ? o.revenueAmount : 0), 0);

  const codePairWeights = Array.from(weights.entries()).map(([key, entry]) => ({
    key,
    weight: Math.round(entry.weight * 1000) / 1000,
    total: entry.totalClaims,
    paid: entry.paidClaims,
    denied: entry.deniedClaims,
  }));

  return {
    totalOutcomes,
    totalPaid,
    totalDenied,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    denialRate: totalOutcomes > 0 ? Math.round((totalDenied / totalOutcomes) * 1000) / 1000 : 0,
    codePairWeights,
  };
}

export function getOutcomeLog(limit = 100): ClaimOutcome[] {
  return outcomeLog.slice(-limit);
}
