import { logMetric } from "../monitoring/metrics";

export interface EligibilityResult {
  verificationId: string;
  patientId:      string;
  payer:          string;
  memberId:       string;
  verifiedAt:     string;
  eligible:       boolean;
  coverageType:   "PPO" | "HMO" | "EPO" | "POS" | "HDHP" | "Medicare" | "Medicaid" | "None";
  copay:          number;
  coinsurance:    number;
  deductible:     number;
  deductibleMet:  number;
  outOfPocketMax: number;
  outOfPocketMet: number;
  referralRequired: boolean;
  priorAuthRequired: boolean;
  flags:          string[];
  networkStatus:  "in-network" | "out-of-network" | "unknown";
}

const cache: Map<string, EligibilityResult> = new Map();
const history: EligibilityResult[] = [];

const PAYER_CONFIGS: Record<string, Partial<EligibilityResult>> = {
  "bcbs-ny":       { coverageType: "PPO", copay: 25,  coinsurance: 20, deductible: 1500, outOfPocketMax: 5000, referralRequired: false, priorAuthRequired: false },
  "aetna":         { coverageType: "HMO", copay: 30,  coinsurance: 20, deductible: 2000, outOfPocketMax: 6000, referralRequired: true,  priorAuthRequired: true  },
  "cigna":         { coverageType: "PPO", copay: 20,  coinsurance: 15, deductible: 1000, outOfPocketMax: 4000, referralRequired: false, priorAuthRequired: false },
  "unitedhealth":  { coverageType: "PPO", copay: 35,  coinsurance: 20, deductible: 2500, outOfPocketMax: 7500, referralRequired: false, priorAuthRequired: true  },
  "humana":        { coverageType: "HMO", copay: 20,  coinsurance: 20, deductible: 1800, outOfPocketMax: 5500, referralRequired: true,  priorAuthRequired: false },
  "medicare":      { coverageType: "Medicare", copay: 0, coinsurance: 20, deductible: 226, outOfPocketMax: 0, referralRequired: false, priorAuthRequired: false },
  "medicaid":      { coverageType: "Medicaid", copay: 1, coinsurance: 0,  deductible: 0,  outOfPocketMax: 0, referralRequired: false, priorAuthRequired: false },
};

function buildFlags(result: Partial<EligibilityResult>, deductiblePct: number): string[] {
  const flags: string[] = [];
  if (!result.eligible) flags.push("NOT ELIGIBLE — check coverage dates");
  if (result.referralRequired) flags.push("Referral required before visit");
  if (result.priorAuthRequired) flags.push("Prior auth required for procedures");
  if (deductiblePct < 0.5) flags.push(`Deductible only ${(deductiblePct * 100).toFixed(0)}% met — patient owes ${result.copay} copay + ${result.coinsurance}% coinsurance`);
  if (result.outOfPocketMax === 0) flags.push("No OOP maximum — government plan");
  return flags;
}

export async function checkEligibility(input: {
  patientId: string;
  payer: string;
  memberId?: string;
}): Promise<EligibilityResult> {
  const cacheKey = `${input.patientId}:${input.payer}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - new Date(cached.verifiedAt).getTime()) < 3_600_000) {
    return cached;
  }

  const config = PAYER_CONFIGS[input.payer.toLowerCase()] ?? {
    coverageType: "PPO" as const, copay: 30, coinsurance: 20,
    deductible: 2000, outOfPocketMax: 6000, referralRequired: false, priorAuthRequired: false,
  };

  const eligible      = Math.random() > 0.07;  // 93% eligibility rate
  const deductible    = config.deductible ?? 1500;
  const deductibleMet = Math.floor(Math.random() * deductible);
  const outOfPocket   = config.outOfPocketMax ?? 5000;
  const outOfPocketMet = Math.floor(Math.random() * outOfPocket * 0.6);
  const deductiblePct = deductibleMet / Math.max(1, deductible);

  const result: EligibilityResult = {
    verificationId: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    patientId:  input.patientId,
    payer:      input.payer,
    memberId:   input.memberId ?? `MBR-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    verifiedAt: new Date().toISOString(),
    eligible,
    coverageType:     (config.coverageType ?? "PPO") as EligibilityResult["coverageType"],
    copay:            eligible ? (config.copay ?? 30) : 0,
    coinsurance:      config.coinsurance ?? 20,
    deductible,
    deductibleMet,
    outOfPocketMax:   outOfPocket,
    outOfPocketMet,
    referralRequired: config.referralRequired ?? false,
    priorAuthRequired: config.priorAuthRequired ?? false,
    networkStatus:    Math.random() > 0.15 ? "in-network" : "out-of-network",
    flags:            [],
  };
  result.flags = buildFlags(result, deductiblePct);

  cache.set(cacheKey, result);
  history.unshift(result);
  if (history.length > 200) history.pop();

  logMetric("eligibility.check", 1, "throughput", { payer: input.payer, eligible: String(eligible) });
  return result;
}

export function getEligibilityHistory(limit = 30): EligibilityResult[] {
  return history.slice(0, limit);
}

export function getEligibilityStats() {
  const total    = history.length;
  const eligible = history.filter(r => r.eligible).length;
  const oon      = history.filter(r => r.networkStatus === "out-of-network").length;
  const paReq    = history.filter(r => r.priorAuthRequired).length;
  const byPayer  = history.reduce((acc, r) => { acc[r.payer] = (acc[r.payer] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  return {
    total,
    eligibilityRate:   total ? eligible / total : 0,
    outOfNetworkRate:  total ? oon / total : 0,
    priorAuthRate:     total ? paReq / total : 0,
    byPayer,
    avgCopay: history.length
      ? history.filter(r => r.eligible).reduce((s, r) => s + r.copay, 0) / Math.max(1, eligible)
      : 0,
  };
}

// Seed with examples
(async function seed() {
  const samples = [
    { patientId: "pt-001", payer: "bcbs-ny" },
    { patientId: "pt-002", payer: "aetna" },
    { patientId: "pt-003", payer: "cigna" },
    { patientId: "pt-004", payer: "medicare" },
    { patientId: "pt-005", payer: "unitedhealth" },
  ];
  for (const s of samples) {
    await checkEligibility(s).catch(() => {});
  }
})();
