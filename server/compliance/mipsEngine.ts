import { logMetric } from "../monitoring/metrics";

export interface MIPSScore {
  qualityScore:      number;   // 0–100
  improvementScore:  number;   // 0–100
  costScore:         number;   // 0–100
  promotingInterop:  number;   // 0–100
  composite:         number;   // weighted composite 0–100
  performanceCategory: "exceptional" | "above_average" | "average" | "below_average" | "penalty_risk";
  estimatedBonus:    number;   // USD estimate
  details:           Record<string, any>;
}

export interface MIPSInputCase {
  caseId:      string;
  correct:     boolean;
  latencyMs:   number;
  safetyPassed: boolean;
  billedAmount?: number;
  elr?: boolean;  // electronic lab reporting
}

const COMPOSITE_WEIGHTS = { quality: 0.45, improvement: 0.15, cost: 0.30, promotingInterop: 0.10 };

function getCategory(score: number): MIPSScore["performanceCategory"] {
  if (score >= 90) return "exceptional";
  if (score >= 75) return "above_average";
  if (score >= 60) return "average";
  if (score >= 45) return "below_average";
  return "penalty_risk";
}

export function computeMIPS(cases: MIPSInputCase[]): MIPSScore {
  if (cases.length === 0) {
    return {
      qualityScore: 0, improvementScore: 0, costScore: 0, promotingInterop: 0,
      composite: 0, performanceCategory: "penalty_risk", estimatedBonus: 0, details: {},
    };
  }

  const correct     = cases.filter(c => c.correct).length;
  const safe        = cases.filter(c => c.safetyPassed).length;
  const fastCases   = cases.filter(c => c.latencyMs < 300).length;
  const elrEnabled  = cases.filter(c => c.elr).length;
  const totalBilled = cases.reduce((s, c) => s + (c.billedAmount ?? 0), 0);

  const qualityRaw     = correct / cases.length;
  const safetyRate     = safe    / cases.length;
  const qualityScore   = Math.round(((qualityRaw * 0.7) + (safetyRate * 0.3)) * 100);

  const improvementScore = Math.round(Math.min(100, (fastCases / cases.length) * 120));

  const avgBill  = totalBilled / cases.length;
  const costScore = avgBill === 0 ? 80 : Math.round(Math.max(0, Math.min(100, 100 - (avgBill - 150) / 10)));

  const promotingInterop = elrEnabled > 0 ? Math.round((elrEnabled / cases.length) * 100) : 75;

  const composite = Math.round(
    qualityScore    * COMPOSITE_WEIGHTS.quality +
    improvementScore * COMPOSITE_WEIGHTS.improvement +
    costScore       * COMPOSITE_WEIGHTS.cost +
    promotingInterop * COMPOSITE_WEIGHTS.promotingInterop
  );

  const performanceCategory = getCategory(composite);

  const bonusTable: Record<MIPSScore["performanceCategory"], number> = {
    exceptional:   1500, above_average: 750, average: 0, below_average: -500, penalty_risk: -2000,
  };
  const estimatedBonus = bonusTable[performanceCategory];

  logMetric("mips.composite", composite, "quality");

  return {
    qualityScore, improvementScore, costScore, promotingInterop,
    composite, performanceCategory, estimatedBonus,
    details: {
      totalCases: cases.length, correctCases: correct, safeCases: safe,
      fastCases, elrEnabled, avgBilledAmount: Math.round(avgBill),
    },
  };
}

export function getMIPSSummary(cases: MIPSInputCase[]) {
  const score = computeMIPS(cases);
  return { score, reportedAt: new Date().toISOString() };
}
