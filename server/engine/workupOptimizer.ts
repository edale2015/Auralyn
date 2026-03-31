import { db } from "../db";
import { kbWorkupCosts, kbTestUtility } from "../../shared/schema";
import { eq } from "drizzle-orm";

export interface WorkupCandidate {
  testName: string;
  cost: number;
  utility: number;
  riskScore: number;
  sensitivity: number | null;
  specificity: number | null;
  turnaroundMinutes: number | null;
}

export interface WorkupOptimizerResult {
  recommended: WorkupCandidate[];
  excluded: WorkupCandidate[];
  totalCost: number;
  budget: number;
  trace: Array<{ testName: string; utilityScore: number; reason: string }>;
}

export async function optimizeWorkup(
  currentDx: Array<{ diagnosis: string; diagnosisLabel?: string; posterior: number }>,
  budget = 1000
): Promise<WorkupOptimizerResult> {
  const [costs, utils] = await Promise.all([
    db.select().from(kbWorkupCosts).where(eq(kbWorkupCosts.isActive, true)),
    db.select().from(kbTestUtility).where(eq(kbTestUtility.isActive, true)),
  ]);

  const scored: WorkupCandidate[] = [];

  for (const t of costs) {
    let u = 0;
    for (const d of currentDx) {
      const tu = utils.find(x => x.testName === t.testName && x.diagnosis === d.diagnosis);
      if (tu) u += d.posterior * tu.infoGain;
    }
    const value = u / Math.max(1, t.cost) - (t.riskScore ?? 0);
    scored.push({
      testName: t.testName,
      cost: t.cost,
      utility: value,
      riskScore: t.riskScore ?? 0,
      sensitivity: t.sensitivity,
      specificity: t.specificity,
      turnaroundMinutes: t.turnaroundMinutes,
    });
  }

  scored.sort((a, b) => b.utility - a.utility);

  const recommended: WorkupCandidate[] = [];
  const excluded: WorkupCandidate[] = [];
  const trace: WorkupOptimizerResult["trace"] = [];
  let remaining = budget;

  for (const t of scored) {
    if (t.cost <= remaining && t.utility > 0) {
      recommended.push(t);
      remaining -= t.cost;
      trace.push({ testName: t.testName, utilityScore: t.utility, reason: "selected: utility > 0 and within budget" });
    } else {
      const reason = t.utility <= 0 ? "excluded: zero/negative utility" : "excluded: over budget";
      excluded.push(t);
      trace.push({ testName: t.testName, utilityScore: t.utility, reason });
    }
  }

  return { recommended, excluded, totalCost: budget - remaining, budget, trace };
}
