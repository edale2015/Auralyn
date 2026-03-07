import { firestoreCaseStore } from "./firestoreCaseStore";
import { discrepancyService } from "./discrepancyService";

export interface DailyDigest {
  date: string;
  totalCases: number;
  casesAwaitingReview: number;
  casesInReview: number;
  casesSignedOff: number;
  casesExported: number;
  discrepancyCount: number;
  blockedExports: number;
  avgQueueAgeMinutes: number | null;
  complaintBreakdown: { complaintId: string; count: number }[];
}

export async function buildDailyDigest(): Promise<DailyDigest> {
  const cases = await firestoreCaseStore.listCases({ limit: 500 });
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const recentCases = cases.filter((c) => {
    const ts = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    return ts > oneDayAgo;
  });

  let awaitingReview = 0;
  let inReview = 0;
  let signedOff = 0;
  let exported = 0;
  let blockedExports = 0;
  const queueAges: number[] = [];
  const complaintCounts = new Map<string, number>();

  for (const c of cases) {
    const ccId = c.complaintId || "unknown";
    complaintCounts.set(ccId, (complaintCounts.get(ccId) || 0) + 1);

    if (c.status === "AWAITING_REVIEW" || c.reviewStatus === "AWAITING_REVIEW") {
      awaitingReview++;
      if (c.updatedAt) {
        queueAges.push((now - new Date(c.updatedAt).getTime()) / 60000);
      }
    }
    if (c.status === "IN_REVIEW" || c.reviewStatus === "IN_REVIEW") inReview++;
    if (c.status === "SIGNED_OFF" || c.reviewStatus === "SIGNED_OFF") signedOff++;
    if (c.status === "EXPORTED") exported++;

    if (c.status === "SIGNED_OFF" && !c.exportedAt) {
      const hasNote = !!c.noteDraft;
      if (!hasNote) blockedExports++;
    }
  }

  let discrepancyCount = 0;
  try {
    const disc = await discrepancyService.listRecentDiscrepancies(500);
    discrepancyCount = disc.length;
  } catch {
  }

  return {
    date: new Date().toISOString().split("T")[0],
    totalCases: recentCases.length,
    casesAwaitingReview: awaitingReview,
    casesInReview: inReview,
    casesSignedOff: signedOff,
    casesExported: exported,
    discrepancyCount,
    blockedExports,
    avgQueueAgeMinutes: queueAges.length > 0
      ? Math.round(queueAges.reduce((a, b) => a + b, 0) / queueAges.length)
      : null,
    complaintBreakdown: Array.from(complaintCounts.entries())
      .map(([complaintId, count]) => ({ complaintId, count }))
      .sort((a, b) => b.count - a.count),
  };
}
