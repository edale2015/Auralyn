import { randomUUID } from "crypto";
import { getQualityReviewStore, type QualityReview } from "../analytics/qualityReview";
import { getTraceStore, type StoredTrace } from "../traces/traceStore";
import { detectFrictionInConversation, type FrictionSignal } from "../analytics/frictionDetector";
import { replayRun, type ReplayResult } from "./replayRunner";
import { runRcSuite, type RcReport } from "./rcRunner";
import { computeConversationMetrics, type ConversationMetrics } from "../analytics/conversationMetrics";

export interface FailureCluster {
  clusterId: string;
  reason: string;
  chiefComplaint: string;
  frictionTypes: string[];
  runIds: string[];
  count: number;
}

export interface ClusterReplayResult {
  clusterId: string;
  configs: Array<{
    label: string;
    toneProfile?: string;
    llmEnabled: boolean;
    results: Array<{
      sourceRunId: string;
      replayRunId: string;
      hardFailures: number;
      softFailures: number;
      improved: boolean;
    }>;
    overallImproved: boolean;
  }>;
}

export interface WeeklyReport {
  id: string;
  weekNumber: number;
  createdAt: string;
  badRunsAnalyzed: number;
  clusters: FailureCluster[];
  clusterReplays: ClusterReplayResult[];
  rcGateResult: { pass: boolean; passRate: number } | null;
  metricsBaseline: Partial<ConversationMetrics> | null;
  metricsCurrent: Partial<ConversationMetrics> | null;
  metricsDelta: Record<string, number> | null;
  promoted: boolean;
  summary: string;
}

function getIsoWeekNumber(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

async function pullBadRuns(limit: number): Promise<QualityReview[]> {
  const reviews = await getQualityReviewStore().list(200);
  return reviews
    .filter(r => r.rating === "bad")
    .slice(0, limit);
}

async function clusterRuns(badReviews: QualityReview[]): Promise<FailureCluster[]> {
  const clusterMap = new Map<string, FailureCluster>();

  for (const review of badReviews) {
    const trace = await getTraceStore().getByRunId(review.runId);
    if (!trace) continue;

    const reason = review.reason ?? "unspecified";
    const complaint = trace.chiefComplaint;

    const messages: Array<{ text: string; from: "patient" | "system" }> = [];
    for (const step of trace.steps) {
      const action = step.action as Record<string, unknown>;
      const outputs = step.outputs as Record<string, unknown>;
      if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
        const prompt = String(outputs?.reframedText ?? outputs?.prompt ?? action.originalPrompt ?? "");
        if (prompt) messages.push({ text: prompt, from: "system" });
        if (outputs?.answer !== undefined) {
          messages.push({ text: String(outputs.answer), from: "patient" });
        }
      }
    }
    const frictionSignals = detectFrictionInConversation(messages);
    const frictionTypes = [...new Set(frictionSignals.map(f => f.type))];

    const clusterKey = `${reason}::${complaint}`;
    const existing = clusterMap.get(clusterKey);
    if (existing) {
      existing.runIds.push(review.runId);
      existing.count++;
      for (const ft of frictionTypes) {
        if (!existing.frictionTypes.includes(ft)) {
          existing.frictionTypes.push(ft);
        }
      }
    } else {
      clusterMap.set(clusterKey, {
        clusterId: randomUUID().slice(0, 8),
        reason,
        chiefComplaint: complaint,
        frictionTypes,
        runIds: [review.runId],
        count: 1,
      });
    }
  }

  return [...clusterMap.values()].sort((a, b) => b.count - a.count);
}

const REPLAY_CONFIGS = [
  { label: "empathetic_tone", toneProfile: "empathetic", llmEnabled: true },
  { label: "concise_tone", toneProfile: "concise", llmEnabled: true },
  { label: "llm_off", llmEnabled: false },
];

async function replayClusters(clusters: FailureCluster[]): Promise<ClusterReplayResult[]> {
  const results: ClusterReplayResult[] = [];

  for (const cluster of clusters.slice(0, 5)) {
    const configResults: ClusterReplayResult["configs"] = [];

    for (const config of REPLAY_CONFIGS) {
      const runResults: ClusterReplayResult["configs"][0]["results"] = [];

      for (const runId of cluster.runIds.slice(0, 3)) {
        try {
          const replay = await replayRun(runId, {
            toneProfile: config.toneProfile,
            llmEnabled: config.llmEnabled,
          });
          runResults.push({
            sourceRunId: runId,
            replayRunId: replay.replayRunId,
            hardFailures: replay.diff.hard.length,
            softFailures: replay.diff.soft.length,
            improved: replay.diff.hard.length === 0,
          });
        } catch (err) {
          console.warn(`[WeeklyImprovement] Replay failed for ${runId}:`, err);
        }
      }

      const overallImproved = runResults.length > 0 &&
        runResults.filter(r => r.improved).length > runResults.length / 2;

      configResults.push({
        label: config.label,
        toneProfile: config.toneProfile,
        llmEnabled: config.llmEnabled,
        results: runResults,
        overallImproved,
      });
    }

    results.push({ clusterId: cluster.clusterId, configs: configResults });
  }

  return results;
}

export async function runWeeklyImprovement(): Promise<WeeklyReport> {
  const reportId = randomUUID().slice(0, 8);
  const weekNumber = getIsoWeekNumber();

  const badReviews = await pullBadRuns(20);
  const clusters = await clusterRuns(badReviews);
  const clusterReplays = await replayClusters(clusters);

  let rcGateResult: WeeklyReport["rcGateResult"] = null;
  const hasImprovements = clusterReplays.some(cr =>
    cr.configs.some(c => c.overallImproved)
  );

  if (hasImprovements) {
    try {
      const rcReport = await runRcSuite();
      rcGateResult = {
        pass: rcReport.failCount === 0,
        passRate: rcReport.passRate,
      };
    } catch (err) {
      console.error("[WeeklyImprovement] RC gate failed:", err);
    }
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

  let metricsBaseline: Partial<ConversationMetrics> | null = null;
  let metricsCurrent: Partial<ConversationMetrics> | null = null;
  let metricsDelta: Record<string, number> | null = null;

  try {
    const allTraces = await getTraceStore().list({ limit: 200 });
    const baseline = computeConversationMetrics(allTraces, twoWeeksAgo, oneWeekAgo);
    const current = computeConversationMetrics(allTraces, oneWeekAgo, now.toISOString());

    metricsBaseline = baseline;
    metricsCurrent = current;

    metricsDelta = {
      turnsToCompletionMean: current.turnsToCompletion.mean - baseline.turnsToCompletion.mean,
      escalationRate: current.escalationToStaffRate - baseline.escalationToStaffRate,
      frictionRate: current.reaskRate - baseline.reaskRate,
      dropoutRate: current.dropoutRate - baseline.dropoutRate,
      requiredQCompletionPct: current.requiredQCompletionPct - baseline.requiredQCompletionPct,
    };
  } catch (err) {
    console.warn("[WeeklyImprovement] Metrics computation failed:", err);
  }

  const promoted = (rcGateResult?.pass ?? false) && hasImprovements;

  const improvingClusters = clusterReplays
    .filter(cr => cr.configs.some(c => c.overallImproved))
    .map(cr => {
      const cluster = clusters.find(c => c.clusterId === cr.clusterId);
      const bestConfig = cr.configs.find(c => c.overallImproved);
      return `${cluster?.reason} (${cluster?.chiefComplaint}): improved with ${bestConfig?.label}`;
    });

  const lines: string[] = [];
  lines.push(`Week ${weekNumber} Improvements Report`);
  lines.push(`Analyzed ${badReviews.length} bad runs across ${clusters.length} clusters`);
  if (improvingClusters.length > 0) {
    lines.push(`Improved clusters: ${improvingClusters.join("; ")}`);
  }
  if (rcGateResult) {
    lines.push(`RC gate: ${rcGateResult.pass ? "PASS" : "FAIL"} (${(rcGateResult.passRate * 100).toFixed(0)}%)`);
  }
  if (metricsDelta) {
    lines.push(`Metric deltas: turns ${metricsDelta.turnsToCompletionMean > 0 ? "+" : ""}${metricsDelta.turnsToCompletionMean.toFixed(1)}, escalation ${metricsDelta.escalationRate > 0 ? "+" : ""}${metricsDelta.escalationRate.toFixed(1)}%, dropout ${metricsDelta.dropoutRate > 0 ? "+" : ""}${metricsDelta.dropoutRate.toFixed(1)}%`);
  }
  lines.push(`Promoted: ${promoted ? "YES" : "NO"}`);

  return {
    id: reportId,
    weekNumber,
    createdAt: new Date().toISOString(),
    badRunsAnalyzed: badReviews.length,
    clusters,
    clusterReplays,
    rcGateResult,
    metricsBaseline,
    metricsCurrent,
    metricsDelta,
    promoted,
    summary: lines.join("\n"),
  };
}
