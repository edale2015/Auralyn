import { firestoreCaseStore } from "./firestoreCaseStore";
import { discrepancyService } from "./discrepancyService";

export interface WorkflowHealthScore {
  overallScore: number;
  components: {
    key: string;
    label: string;
    score: number;
    detail: string;
  }[];
  generatedAt: string;
}

export async function computeWorkflowHealth(): Promise<WorkflowHealthScore> {
  const cases = await firestoreCaseStore.listCases({ limit: 300 });
  const components: WorkflowHealthScore["components"] = [];

  const reviewable = cases.filter(
    (c) => c.status === "AWAITING_REVIEW" || c.status === "IN_REVIEW" || c.reviewStatus === "AWAITING_REVIEW"
  );
  const signedOff = cases.filter(
    (c) => c.status === "SIGNED_OFF" || c.reviewStatus === "SIGNED_OFF"
  );

  const reviewRate = cases.length > 0 ? signedOff.length / cases.length : 1;
  components.push({
    key: "review_completion",
    label: "Review Completion Rate",
    score: Math.min(100, Math.round(reviewRate * 100)),
    detail: `${signedOff.length} / ${cases.length} cases reviewed`,
  });

  const queueSize = reviewable.length;
  const queueScore = Math.max(0, 100 - queueSize * 10);
  components.push({
    key: "queue_depth",
    label: "Queue Depth",
    score: Math.min(100, queueScore),
    detail: `${queueSize} case(s) pending review`,
  });

  let discrepancyCount = 0;
  try {
    const disc = await discrepancyService.listRecentDiscrepancies(300);
    discrepancyCount = disc.length;
  } catch {
  }
  const discScore = Math.max(0, 100 - discrepancyCount * 5);
  components.push({
    key: "discrepancy_rate",
    label: "Discrepancy Rate",
    score: Math.min(100, discScore),
    detail: `${discrepancyCount} discrepancies detected`,
  });

  const blockedExports = cases.filter(
    (c) => c.status === "SIGNED_OFF" && !c.exportedAt && !c.noteDraft
  ).length;
  const exportScore = Math.max(0, 100 - blockedExports * 15);
  components.push({
    key: "export_readiness",
    label: "Export Readiness",
    score: Math.min(100, exportScore),
    detail: `${blockedExports} export(s) blocked`,
  });

  const redFlagCases = cases.filter(
    (c) => (c.engineResult?.triggeredRedFlags?.length ?? 0) > 0
  );
  const redFlagReviewedCount = redFlagCases.filter(
    (c) => c.status === "SIGNED_OFF" || c.reviewStatus === "SIGNED_OFF"
  ).length;
  const rfScore = redFlagCases.length > 0
    ? Math.round((redFlagReviewedCount / redFlagCases.length) * 100)
    : 100;
  components.push({
    key: "red_flag_coverage",
    label: "Red Flag Review Coverage",
    score: rfScore,
    detail: `${redFlagReviewedCount} / ${redFlagCases.length} red-flag cases reviewed`,
  });

  const overallScore = components.length > 0
    ? Math.round(components.reduce((s, c) => s + c.score, 0) / components.length)
    : 100;

  return {
    overallScore,
    components,
    generatedAt: new Date().toISOString(),
  };
}
