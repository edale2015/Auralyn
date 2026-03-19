export interface PayerOutcome {
  payer: string;
  icd10: string;
  cpt: string;
  paid: boolean;
  revenue: number;
  denialReasons?: string[];
}

interface PayerWeight {
  weight: number;
  totalClaims: number;
  paidClaims: number;
  deniedClaims: number;
  totalRevenue: number;
  avgRevenue: number;
  lastUpdated: string;
}

const payerWeights: Record<string, Record<string, PayerWeight>> = {};
const outcomeLog: Array<PayerOutcome & { timestamp: string }> = [];

function codingKey(icd10: string, cpt: string): string {
  return `${icd10}_${cpt}`;
}

export function updatePayerRLHF(outcome: PayerOutcome): PayerWeight {
  const payer = outcome.payer.toLowerCase();
  const key = codingKey(outcome.icd10, outcome.cpt);

  if (!payerWeights[payer]) payerWeights[payer] = {};
  if (!payerWeights[payer][key]) {
    payerWeights[payer][key] = { weight: 0.5, totalClaims: 0, paidClaims: 0, deniedClaims: 0, totalRevenue: 0, avgRevenue: 0, lastUpdated: "" };
  }

  const w = payerWeights[payer][key];
  w.totalClaims++;

  if (outcome.paid) {
    w.paidClaims++;
    w.totalRevenue += outcome.revenue;
    const reward = Math.min(0.15, outcome.revenue / 3000);
    w.weight = Math.min(1, w.weight + reward);
  } else {
    w.deniedClaims++;
    w.weight = Math.max(0, w.weight - 0.2);
  }

  w.avgRevenue = w.totalClaims > 0 ? Math.round(w.totalRevenue / w.totalClaims) : 0;
  w.lastUpdated = new Date().toISOString();

  outcomeLog.push({ ...outcome, timestamp: w.lastUpdated });
  if (outcomeLog.length > 1000) outcomeLog.splice(0, outcomeLog.length - 1000);

  return { ...w };
}

export function getPayerScore(icd10: string, cpt: string, payer: string): number {
  const key = codingKey(icd10, cpt);
  return payerWeights[payer.toLowerCase()]?.[key]?.weight ?? 0.4;
}

export function getPayerWeights(payer: string): Record<string, PayerWeight> {
  return { ...(payerWeights[payer.toLowerCase()] || {}) };
}

export function getAllPayerStats(): Record<string, {
  totalClaims: number;
  paidClaims: number;
  denialRate: number;
  totalRevenue: number;
  codePairCount: number;
}> {
  const stats: Record<string, any> = {};
  for (const [payer, weights] of Object.entries(payerWeights)) {
    let total = 0, paid = 0, revenue = 0;
    for (const w of Object.values(weights)) {
      total += w.totalClaims;
      paid += w.paidClaims;
      revenue += w.totalRevenue;
    }
    stats[payer] = {
      totalClaims: total,
      paidClaims: paid,
      denialRate: total > 0 ? Math.round((1 - paid / total) * 1000) / 1000 : 0,
      totalRevenue: revenue,
      codePairCount: Object.keys(weights).length,
    };
  }
  return stats;
}

export function getPayerOutcomeLog(limit = 100): typeof outcomeLog {
  return outcomeLog.slice(-limit);
}
