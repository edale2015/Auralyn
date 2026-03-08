import type { PhysicianDecision } from "./physicianDecisionModel";

export interface MismatchSummary {
  totalDecisions: number;
  agreements: number;
  disagreements: number;
  agreementRate: number;
  commonOverrides: { from: string; to: string; count: number }[];
}

export function analyzeMismatches(decisions: PhysicianDecision[]): MismatchSummary {
  const agreements = decisions.filter((d) => d.agreed).length;
  const overrideMap = new Map<string, number>();

  for (const d of decisions.filter((x) => !x.agreed)) {
    const key = `${d.engineDisposition}->${d.physicianDisposition}`;
    overrideMap.set(key, (overrideMap.get(key) || 0) + 1);
  }

  const commonOverrides = Array.from(overrideMap.entries())
    .map(([key, count]) => {
      const [from, to] = key.split("->");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    totalDecisions: decisions.length,
    agreements,
    disagreements: decisions.length - agreements,
    agreementRate: decisions.length > 0 ? agreements / decisions.length : 0,
    commonOverrides,
  };
}
