import { firestoreCaseStore } from "../firestoreCaseStore";
import { getLatestRunForComplaint } from "../testing/engineResultStore";
import { getFirestore } from "firebase-admin/firestore";

export interface ComplaintControlSummary {
  complaintId: string;
  totalCases: number;
  activeCases: number;
  completedCases: number;
  avgEngineConfidence: string;
  redFlagRate: number;
  dispositionBreakdown: Record<string, number>;
  lastCaseAt?: string;
  latestAccuracy?: number;
  underTriageCount?: number;
  underTriageRate?: number;
  overTriageCount?: number;
  mismatchCount?: number;
  totalSyntheticRuns?: number;
  goldReviewCount?: number;
}

async function getGoldReviewCounts(): Promise<Record<string, number>> {
  try {
    const snap = await getFirestore().collection("gold_reviews").get();
    const counts: Record<string, number> = {};
    for (const doc of snap.docs) {
      const cid = doc.data().complaintId || "unknown";
      counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}

async function getValidationRunCounts(): Promise<Record<string, number>> {
  try {
    const snap = await getFirestore().collection("validation_runs").get();
    const counts: Record<string, number> = {};
    for (const doc of snap.docs) {
      const cid = doc.data().complaintId || "unknown";
      counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}

export async function getControlCenterSummary(): Promise<ComplaintControlSummary[]> {
  const [cases, goldCounts, runCounts] = await Promise.all([
    firestoreCaseStore.listCases({ limit: 500 }),
    getGoldReviewCounts(),
    getValidationRunCounts(),
  ]);

  const map = new Map<string, { cases: any[] }>();
  for (const c of cases) {
    const ccId = c.complaintId || "unknown";
    if (!map.has(ccId)) map.set(ccId, { cases: [] });
    map.get(ccId)!.cases.push(c);
  }

  const allComplaintIds = new Set([
    ...map.keys(),
    ...Object.keys(goldCounts),
    ...Object.keys(runCounts),
  ]);

  const summaries: ComplaintControlSummary[] = [];

  for (const complaintId of allComplaintIds) {
    const data = map.get(complaintId) || { cases: [] };
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

    let latestAccuracy: number | undefined;
    let underTriageCount: number | undefined;
    let underTriageRate: number | undefined;
    let overTriageCount: number | undefined;
    let mismatchCount: number | undefined;

    try {
      const latestRun = await getLatestRunForComplaint(complaintId);
      if (latestRun?.stats) {
        latestAccuracy = latestRun.stats.accuracy;
        underTriageCount = latestRun.stats.underTriageCount;
        underTriageRate = latestRun.stats.underTriageRate;
        overTriageCount = latestRun.stats.overTriageCount;
        mismatchCount = latestRun.stats.mismatchCount;
      }
    } catch {}

    summaries.push({
      complaintId,
      totalCases: data.cases.length,
      activeCases,
      completedCases,
      avgEngineConfidence: "medium",
      redFlagRate: data.cases.length > 0 ? redFlagCount / data.cases.length : 0,
      dispositionBreakdown,
      lastCaseAt: sorted[0]?.createdAt,
      latestAccuracy,
      underTriageCount,
      underTriageRate,
      overTriageCount,
      mismatchCount,
      totalSyntheticRuns: runCounts[complaintId] || 0,
      goldReviewCount: goldCounts[complaintId] || 0,
    });
  }

  return summaries.sort((a, b) => b.totalCases - a.totalCases);
}
