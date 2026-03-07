import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreSignoffStore } from "./firestoreSignoffStore";

export interface OverridePattern {
  complaintId: string;
  totalCases: number;
  overrideCount: number;
  overrideRate: number;
  dispositionOverrides: { transitions: { from: string; to: string; count: number }[] };
  topOverrideReasons: { reason: string; count: number }[];
}

export async function analyzeOverridePatterns(limit = 200): Promise<OverridePattern[]> {
  const cases = await firestoreCaseStore.listCases({ limit });
  const complaintMap = new Map<string, {
    totalCases: number;
    overrides: Array<{ from: string; to: string; reason: string }>;
  }>();

  for (const c of cases) {
    const ccId = c.complaintId || "unknown";
    if (!complaintMap.has(ccId)) {
      complaintMap.set(ccId, { totalCases: 0, overrides: [] });
    }
    const entry = complaintMap.get(ccId)!;
    entry.totalCases++;

    try {
      const signoffs = await firestoreSignoffStore.listSignoffsForCase(c.caseId);
      for (const s of signoffs) {
        const so = s as any;
        if (so.dispositionOverride || so.overriddenDisposition) {
          entry.overrides.push({
            from: c.engineResult?.recommendedDisposition || "unknown",
            to: so.dispositionOverride || so.overriddenDisposition || "unknown",
            reason: so.overrideReason || so.notes || "",
          });
        }
      }
    } catch {
    }
  }

  const patterns: OverridePattern[] = [];
  for (const [ccId, data] of complaintMap) {
    const reasonCounts = new Map<string, number>();
    const dispPairs = new Map<string, { from: string; to: string; count: number }>();

    for (const o of data.overrides) {
      const key = `${o.from}->${o.to}`;
      if (!dispPairs.has(key)) dispPairs.set(key, { from: o.from, to: o.to, count: 0 });
      dispPairs.get(key)!.count++;

      if (o.reason) {
        reasonCounts.set(o.reason, (reasonCounts.get(o.reason) || 0) + 1);
      }
    }

    patterns.push({
      complaintId: ccId,
      totalCases: data.totalCases,
      overrideCount: data.overrides.length,
      overrideRate: data.totalCases > 0 ? data.overrides.length / data.totalCases : 0,
      dispositionOverrides: { transitions: Array.from(dispPairs.values()).sort((a, b) => b.count - a.count) },
      topOverrideReasons: Array.from(reasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    });
  }

  return patterns.sort((a, b) => b.overrideRate - a.overrideRate);
}
