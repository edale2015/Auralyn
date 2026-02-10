import type { StoredTrace } from "../traces/traceStore";

export interface ConversationMetrics {
  period: { from: string; to: string };
  totalRuns: number;
  turnsToCompletion: { mean: number; median: number; p90: number };
  requiredQCompletionPct: number;
  timeToDispositionMs: { mean: number; median: number };
  escalationToStaffRate: number;
  reaskRate: number;
  dropoutRate: number;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function p90(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.9);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function computeConversationMetrics(traces: StoredTrace[], from: string, to: string): ConversationMetrics {
  const filtered = traces.filter(t => {
    const ts = t.createdAt;
    return ts >= from && ts <= to;
  });

  const totalRuns = filtered.length;

  const stepCounts = filtered.map(t => t.steps.length);

  const requiredQCompletions: boolean[] = [];
  const escalationCount = filtered.filter(t => {
    return t.steps.some(s => s.action.type === "ESCALATE_TO_CLINICIAN");
  }).length;

  const reaskCounts: number[] = [];
  const dropoutCount = filtered.filter(t => {
    return t.stopReason === "MAX_STEPS" ||
      t.stopReason === "NEEDS_MORE_INFO" ||
      (t.stopReason !== "completed" && t.stopReason !== "REVIEW_READY" && t.stopReason !== "EMERGENT");
  }).length;

  for (const trace of filtered) {
    const questionIds = new Set<string>();
    let reasks = 0;
    let allQsAnswered = true;

    for (const step of trace.steps) {
      const action = step.action as any;
      if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
        const qId = action.questionId;
        if (questionIds.has(qId)) {
          reasks++;
        }
        questionIds.add(qId);
      }
    }

    if (trace.normalized.disposition === "unknown" || !trace.normalized.disposition) {
      allQsAnswered = false;
    }

    const missingSteps = trace.steps.filter(s => {
      const a = s.action as any;
      return (a.type === "ASK_QUESTION" || a.type === "REFRAME_QUESTION") &&
        s.outputs?.llmSkipped;
    });
    if (missingSteps.length > 0) allQsAnswered = false;

    requiredQCompletions.push(allQsAnswered);
    reaskCounts.push(reasks);
  }

  const totalReasks = reaskCounts.reduce((a, b) => a + b, 0);
  const totalQuestions = filtered.reduce((sum, t) => {
    return sum + t.steps.filter(s => {
      const a = s.action as any;
      return a.type === "ASK_QUESTION" || a.type === "REFRAME_QUESTION";
    }).length;
  }, 0);

  return {
    period: { from, to },
    totalRuns,
    turnsToCompletion: {
      mean: Math.round(mean(stepCounts) * 10) / 10,
      median: median(stepCounts),
      p90: p90(stepCounts),
    },
    requiredQCompletionPct: totalRuns > 0
      ? Math.round((requiredQCompletions.filter(Boolean).length / totalRuns) * 1000) / 10
      : 0,
    timeToDispositionMs: {
      mean: 0,
      median: 0,
    },
    escalationToStaffRate: totalRuns > 0
      ? Math.round((escalationCount / totalRuns) * 1000) / 10
      : 0,
    reaskRate: totalQuestions > 0
      ? Math.round((totalReasks / totalQuestions) * 1000) / 10
      : 0,
    dropoutRate: totalRuns > 0
      ? Math.round((dropoutCount / totalRuns) * 1000) / 10
      : 0,
  };
}
