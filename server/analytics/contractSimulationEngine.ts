import { getPayerReimbursement, listPayers } from "../billing/payerEngine";
import { getPayerScore, getAllPayerStats } from "../learning/payerRLHFEngine";

export interface ContractTerms {
  payer: string;
  cptRates: Record<string, number>;
}

export interface SimulationResult {
  payer: string;
  projectedRevenue: number;
  avgPerEncounter: number;
  expectedDenialRate: number;
  netRevenue: number;
  encounterCount: number;
}

const DEFAULT_CONTRACTS: ContractTerms[] = [
  { payer: "medicare", cptRates: { "99213": 75, "99214": 110, "99215": 145, "99284": 200, "99285": 280 } },
  { payer: "medicaid", cptRates: { "99213": 55, "99214": 80, "99215": 105, "99284": 150, "99285": 210 } },
  { payer: "aetna", cptRates: { "99213": 90, "99214": 130, "99215": 175, "99284": 250, "99285": 350 } },
  { payer: "united", cptRates: { "99213": 85, "99214": 125, "99215": 165, "99284": 240, "99285": 330 } },
  { payer: "cigna", cptRates: { "99213": 88, "99214": 128, "99215": 170, "99284": 245, "99285": 340 } },
  { payer: "bcbs", cptRates: { "99213": 82, "99214": 120, "99215": 160, "99284": 230, "99285": 320 } },
  { payer: "humana", cptRates: { "99213": 80, "99214": 115, "99215": 155, "99284": 220, "99285": 310 } },
  { payer: "self_pay", cptRates: { "99213": 150, "99214": 225, "99215": 350, "99284": 400, "99285": 600 } },
];

export function simulateContracts(
  encounters: Array<{ icd10: string; cpt: string }>,
  contracts?: ContractTerms[],
): SimulationResult[] {
  const terms = contracts || DEFAULT_CONTRACTS;

  return terms.map((contract) => {
    let totalRevenue = 0;

    for (const e of encounters) {
      const rate = contract.cptRates[e.cpt] || 75;
      const payerScore = getPayerScore(e.icd10, e.cpt, contract.payer);
      totalRevenue += rate * payerScore;
    }

    const allStats = getAllPayerStats();
    const payerStat = allStats[contract.payer];
    const denialRate = payerStat?.denialRate ?? 0.15;
    const netRevenue = Math.round(totalRevenue * (1 - denialRate));

    return {
      payer: contract.payer,
      projectedRevenue: Math.round(totalRevenue),
      avgPerEncounter: encounters.length > 0 ? Math.round(totalRevenue / encounters.length) : 0,
      expectedDenialRate: denialRate,
      netRevenue,
      encounterCount: encounters.length,
    };
  });
}

export function chooseBestPayer(
  encounter: { icd10: string; cpt: string },
  payers?: string[],
): { payer: string; expectedValue: number; score: number; rate: number; allOptions: Array<{ payer: string; expectedValue: number }> } {
  const payerList = payers || DEFAULT_CONTRACTS.map((c) => c.payer);

  const options = payerList.map((payer) => {
    const score = getPayerScore(encounter.icd10, encounter.cpt, payer);
    const rate = getPayerReimbursement(payer, encounter.cpt);
    const expectedValue = Math.round(score * rate * 100) / 100;
    return { payer, score, rate, expectedValue };
  });

  options.sort((a, b) => b.expectedValue - a.expectedValue);
  const best = options[0];

  return {
    payer: best.payer,
    expectedValue: best.expectedValue,
    score: best.score,
    rate: best.rate,
    allOptions: options.map((o) => ({ payer: o.payer, expectedValue: o.expectedValue })),
  };
}

export interface ContractingIntelligence {
  payer: string;
  leverage: "high" | "medium" | "low";
  recommendation: string;
  stats: { volume: number; denialRate: number; avgReimbursement: number };
}

export function analyzeContractLeverage(): ContractingIntelligence[] {
  const allStats = getAllPayerStats();

  return Object.entries(allStats).map(([payer, stats]) => {
    let leverage: ContractingIntelligence["leverage"] = "low";
    let recommendation = "Insufficient data for recommendation";

    if (stats.totalClaims >= 50) {
      if (stats.totalClaims > 200 && stats.denialRate < 0.05) {
        leverage = "high";
        recommendation = "Strong position — negotiate higher reimbursement rates based on low denial volume";
      } else if (stats.denialRate > 0.15) {
        leverage = "medium";
        recommendation = "Negotiate denial reduction terms — current denial rate is above acceptable threshold";
      } else if (stats.totalRevenue / stats.totalClaims < 100) {
        leverage = "medium";
        recommendation = "Negotiate higher per-encounter reimbursement — current avg is below market";
      } else {
        leverage = "medium";
        recommendation = "Maintain current contract — monitor for renegotiation opportunity";
      }
    }

    return {
      payer,
      leverage,
      recommendation,
      stats: {
        volume: stats.totalClaims,
        denialRate: stats.denialRate,
        avgReimbursement: stats.totalClaims > 0 ? Math.round(stats.totalRevenue / stats.totalClaims) : 0,
      },
    };
  });
}
