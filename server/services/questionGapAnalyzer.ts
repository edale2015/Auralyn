import { firestoreCaseStore } from "./firestoreCaseStore";

export interface QuestionGap {
  token: string;
  complaintId: string;
  missingCount: number;
  totalCases: number;
  missingRate: number;
  requestedDuringReview: number;
}

export async function analyzeQuestionGaps(limit = 200): Promise<QuestionGap[]> {
  const cases = await firestoreCaseStore.listCases({ limit });

  const gapMap = new Map<string, {
    token: string;
    complaintId: string;
    missingCount: number;
    totalCases: number;
    requestedDuringReview: number;
  }>();

  for (const c of cases) {
    const ccId = c.complaintId || "unknown";
    const answers = c.answers ?? {};
    const critical = c.unansweredCriticalQuestions ?? [];
    const requestedInfo = (c as any).requestedMoreInfo ?? [];

    for (const token of critical) {
      const key = `${ccId}::${token}`;
      if (!gapMap.has(key)) {
        gapMap.set(key, { token, complaintId: ccId, missingCount: 0, totalCases: 0, requestedDuringReview: 0 });
      }
      const entry = gapMap.get(key)!;
      entry.totalCases++;
      if (!answers[token] && answers[token] !== 0) entry.missingCount++;
    }

    for (const req of requestedInfo) {
      const token = typeof req === "string" ? req : req?.token;
      if (!token) continue;
      const key = `${ccId}::${token}`;
      if (!gapMap.has(key)) {
        gapMap.set(key, { token, complaintId: ccId, missingCount: 0, totalCases: 0, requestedDuringReview: 0 });
      }
      gapMap.get(key)!.requestedDuringReview++;
    }
  }

  return Array.from(gapMap.values())
    .map((g) => ({
      ...g,
      missingRate: g.totalCases > 0 ? g.missingCount / g.totalCases : 0,
    }))
    .sort((a, b) => b.missingRate - a.missingRate || b.requestedDuringReview - a.requestedDuringReview);
}
