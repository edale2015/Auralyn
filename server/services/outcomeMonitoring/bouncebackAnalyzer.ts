import { firestoreCaseStore } from "../firestoreCaseStore";

export interface BouncebackCase {
  originalCaseId: string;
  returnCaseId: string;
  patientId: string;
  daysBetween: number;
  originalDisposition: string;
  returnComplaint: string;
}

export async function analyzeBouncebacks(windowDays = 7): Promise<{ bouncebacks: BouncebackCase[]; rate: number; totalCases: number }> {
  const cases = await firestoreCaseStore.listCases({ limit: 500 });
  const byPatient = new Map<string, typeof cases>();

  for (const c of cases) {
    const pid = (c as any).patientId || c.caseId;
    if (!byPatient.has(pid)) byPatient.set(pid, []);
    byPatient.get(pid)!.push(c);
  }

  const bouncebacks: BouncebackCase[] = [];
  for (const [pid, patientCases] of byPatient) {
    if (patientCases.length < 2) continue;
    const sorted = patientCases.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const daysBetween = Math.abs(new Date(curr.createdAt || "").getTime() - new Date(prev.createdAt || "").getTime()) / (1000 * 60 * 60 * 24);
      if (daysBetween <= windowDays) {
        bouncebacks.push({
          originalCaseId: prev.caseId,
          returnCaseId: curr.caseId,
          patientId: pid,
          daysBetween: Math.round(daysBetween),
          originalDisposition: prev.engineResult?.recommendedDisposition || "unknown",
          returnComplaint: curr.complaintId,
        });
      }
    }
  }

  return { bouncebacks, rate: cases.length > 0 ? bouncebacks.length / cases.length : 0, totalCases: cases.length };
}
