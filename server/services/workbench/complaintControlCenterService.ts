import { firestoreCaseStore } from "../firestoreCaseStore";

export interface ComplaintControlSummary {
  complaintId: string;
  totalCases: number;
  activeCases: number;
  completedCases: number;
  avgEngineConfidence: string;
  redFlagRate: number;
  dispositionBreakdown: Record<string, number>;
  lastCaseAt?: string;
}

export async function getControlCenterSummary(): Promise<ComplaintControlSummary[]> {
  const cases = await firestoreCaseStore.listCases({ limit: 500 });
  const map = new Map<string, { cases: any[] }>();

  for (const c of cases) {
    const ccId = c.complaintId || "unknown";
    if (!map.has(ccId)) map.set(ccId, { cases: [] });
    map.get(ccId)!.cases.push(c);
  }

  const summaries: ComplaintControlSummary[] = [];
  for (const [complaintId, data] of map) {
    const activeCases = data.cases.filter((c) => !["CLOSED", "SENT"].includes(c.status || "")).length;
    const completedCases = data.cases.length - activeCases;
    const dispositionBreakdown: Record<string, number> = {};
    let redFlagCount = 0;

    for (const c of data.cases) {
      const d = c.engineResult?.recommendedDisposition || "unknown";
      dispositionBreakdown[d] = (dispositionBreakdown[d] || 0) + 1;
      if ((c.engineResult?.triggeredRedFlags ?? []).length > 0) redFlagCount++;
    }

    const sorted = data.cases.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    summaries.push({
      complaintId,
      totalCases: data.cases.length,
      activeCases,
      completedCases,
      avgEngineConfidence: "medium",
      redFlagRate: data.cases.length > 0 ? redFlagCount / data.cases.length : 0,
      dispositionBreakdown,
      lastCaseAt: sorted[0]?.createdAt,
    });
  }

  return summaries.sort((a, b) => b.totalCases - a.totalCases);
}
