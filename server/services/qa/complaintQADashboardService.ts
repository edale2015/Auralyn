import { firestoreCaseStore } from "../firestoreCaseStore";

export interface ComplaintQASummary {
  complaintId: string;
  totalCases: number;
  overrideCount: number;
  exportFailures: number;
  missingQuestionCount: number;
  dispositionDistribution: Record<string, number>;
}

export async function getComplaintQASummary(complaintId?: string): Promise<ComplaintQASummary[]> {
  const cases = await firestoreCaseStore.listCases({ limit: 500 });
  const map = new Map<string, ComplaintQASummary>();

  for (const c of cases) {
    const ccId = c.complaintId || "unknown";
    if (complaintId && ccId !== complaintId) continue;

    if (!map.has(ccId)) {
      map.set(ccId, { complaintId: ccId, totalCases: 0, overrideCount: 0, exportFailures: 0, missingQuestionCount: 0, dispositionDistribution: {} });
    }
    const entry = map.get(ccId)!;
    entry.totalCases++;

    const disp = c.engineResult?.recommendedDisposition || "unknown";
    entry.dispositionDistribution[disp] = (entry.dispositionDistribution[disp] || 0) + 1;

    if ((c.unansweredCriticalQuestions ?? []).length > 0) entry.missingQuestionCount++;
    if (c.status === "SIGNED_OFF" && !c.exportedAt && !c.noteDraft) entry.exportFailures++;
  }

  return Array.from(map.values()).sort((a, b) => b.totalCases - a.totalCases);
}
