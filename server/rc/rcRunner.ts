import { randomUUID } from "crypto";
import { loadAllTestCases } from "../testcases/loader";
import { getTraceStore, agentRunResponseToStoredTrace, type StoredTrace } from "../traces/traceStore";
import { runAgentLoop, buildAgentRunResponse } from "../agent/runtime";
import { CaseStateSchema, AgentRunConfigSchema } from "../../shared/agentTypes";
import { normalizeAnswer } from "../agent/normalize";
import { getLlmCallLog } from "../traces/llmCallLog";
import { detectFrictionInConversation } from "../analytics/frictionDetector";
import { validateMinimumDataSet } from "../rules/minimumDataSet";
import type { CompareFailure, NormalizedResult } from "../../shared/testingTypes";

export interface RcVariant {
  label: string;
  llmEnabled: boolean;
  toneProfile?: string;
}

export const DEFAULT_VARIANTS: RcVariant[] = [
  { label: "llm_off", llmEnabled: false },
  { label: "llm_on_empathetic", llmEnabled: true, toneProfile: "empathetic" },
  { label: "llm_on_concise", llmEnabled: true, toneProfile: "concise" },
];

export interface RcScenarioResult {
  scenarioId: string;
  label: string;
  variant: string;
  runId: string;
  pass: boolean;
  disposition: string;
  expectedDisposition?: string;
  hardFailures: CompareFailure[];
  softFailures: CompareFailure[];
  latencyMs: number;
  stepCount: number;
  tokensIn: number;
  tokensOut: number;
  frictionCount: number;
}

export interface TemplateVersionDelta {
  templateId: string;
  version: string;
  callCount: number;
  avgLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface RcReport {
  id: string;
  startedAt: string;
  completedAt: string;
  scenarioCount: number;
  variantCount: number;
  totalRuns: number;
  passCount: number;
  failCount: number;
  passRate: number;
  results: RcScenarioResult[];
  topDiffs: CompareFailure[];
  latency: { mean: number; median: number; p95: number };
  tokens: { totalIn: number; totalOut: number; estimatedCostUsd: number };
  frictionRate: number;
  templateVersionDeltas: TemplateVersionDelta[];
}

const DISPOSITION_SAFETY_ORDER = [
  "ed_stat", "ed", "urgent_or_ed", "urgent_care", "urgent",
  "routine_or_supportive", "routine", "self_care_with_routine_followup",
  "self_care_with_precautions", "self_care", "home",
];

function getDispositionSafetyLevel(disp: string): number {
  const normalized = disp.toLowerCase().replace(/[^a-z_]/g, "");
  const idx = DISPOSITION_SAFETY_ORDER.indexOf(normalized);
  if (idx >= 0) return idx;
  if (normalized.includes("urgent") || normalized.includes("ed")) return 3;
  if (normalized.includes("routine")) return 5;
  if (normalized.includes("self_care") || normalized.includes("home")) return 8;
  return -1;
}

function compareNormalized(baseline: NormalizedResult, candidate: NormalizedResult): { hard: CompareFailure[]; soft: CompareFailure[] } {
  const hard: CompareFailure[] = [];
  const soft: CompareFailure[] = [];

  if (baseline.disposition !== candidate.disposition) {
    const baseSafety = getDispositionSafetyLevel(baseline.disposition);
    const candSafety = getDispositionSafetyLevel(candidate.disposition);
    if (baseSafety === -1 || candSafety === -1) {
      hard.push({
        code: "DISPOSITION_UNKNOWN",
        path: "disposition",
        details: `Unknown disposition safety level: ${baseline.disposition} → ${candidate.disposition}`,
        baseline: baseline.disposition,
        candidate: candidate.disposition,
      });
    } else if (candSafety > baseSafety) {
      hard.push({
        code: "DISPOSITION_CHANGED_UP",
        path: "disposition",
        details: `${baseline.disposition} → ${candidate.disposition}`,
        baseline: baseline.disposition,
        candidate: candidate.disposition,
      });
    } else if (candSafety < baseSafety) {
      soft.push({
        code: "DISPOSITION_CHANGED_DOWN",
        path: "disposition",
        details: `${baseline.disposition} → ${candidate.disposition}`,
      });
    }
  }

  const baseRedFlags = new Set(baseline.redFlags || []);
  const candRedFlags = new Set(candidate.redFlags || []);
  for (const rf of baseRedFlags) {
    if (!candRedFlags.has(rf)) {
      hard.push({ code: "RED_FLAG_REMOVED", path: "redFlags", details: `"${rf}" removed` });
    }
  }

  for (const [scoreKey, baseVal] of Object.entries(baseline.scores || {})) {
    const candVal = candidate.scores?.[scoreKey];
    if (candVal !== undefined && candVal !== baseVal) {
      hard.push({
        code: "SCORE_CHANGED",
        path: `scores.${scoreKey}`,
        details: `${baseVal} → ${candVal}`,
        baseline: baseVal,
        candidate: candVal,
      });
    }
  }

  const baseDxSet = new Set(baseline.dx || []);
  const candDxSet = new Set(candidate.dx || []);
  const dxAdded = (candidate.dx || []).filter(d => !baseDxSet.has(d));
  const dxRemoved = (baseline.dx || []).filter(d => !candDxSet.has(d));
  if (dxAdded.length > 0 || dxRemoved.length > 0) {
    soft.push({ code: "DX_CHANGED", path: "dx", details: `added=[${dxAdded}] removed=[${dxRemoved}]` });
  }

  return { hard, soft };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function extractFrictionFromTrace(trace: StoredTrace): number {
  const messages: Array<{ text: string; from: "patient" | "system" }> = [];
  for (const evt of trace.events) {
    if (evt.message && (evt.type === "PATIENT_RESPONSE" || evt.type === "PATIENT_MESSAGE")) {
      messages.push({ text: evt.message, from: "patient" });
    }
  }
  for (const step of trace.steps) {
    const outputs = step.outputs as Record<string, unknown>;
    const action = step.action as any;
    if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
      const prompt = String(outputs?.reframedText ?? outputs?.prompt ?? action.originalPrompt ?? "");
      if (prompt) messages.push({ text: prompt, from: "system" });
    }
  }
  return detectFrictionInConversation(messages).length;
}

export async function runRcSuite(variants?: RcVariant[]): Promise<RcReport> {
  const reportId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const testCases = loadAllTestCases();
  const activeVariants = variants ?? DEFAULT_VARIANTS;

  const results: RcScenarioResult[] = [];

  for (const tc of testCases) {
    let baselineNorm: NormalizedResult | null = null;

    for (const variant of activeVariants) {
      const runId = randomUUID();
      const now = new Date().toISOString();

      const answers: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(tc.case.answers)) {
        answers[k] = normalizeAnswer(v);
      }

      const initialState = CaseStateSchema.parse({
        caseId: `rc_${reportId}_${runId}`,
        createdAt: now,
        updatedAt: now,
        chiefComplaint: tc.chiefComplaint,
        demographics: tc.case.demographics,
        modifiers: tc.case.modifiers,
        answers,
        routing: { state: "INTAKE_PENDING" },
      });

      const cfg = AgentRunConfigSchema.parse({
        runId,
        mode: "REGRESSION",
        maxSteps: 20,
        llm: {
          enabled: variant.llmEnabled,
          temperature: 0,
          ...(variant.toneProfile ? { toneProfile: variant.toneProfile } : {}),
        },
        options: { disableWrites: true, disableTwilio: true, disableFileUploads: true },
      });

      const t0 = Date.now();
      const { finalState, steps, events, stopReason } = await runAgentLoop(initialState, cfg);
      const latencyMs = Date.now() - t0;

      const response = buildAgentRunResponse(runId, "staging", "rc_test", finalState, steps, events);
      const stored = agentRunResponseToStoredTrace(response, {
        caseId: `rc_${reportId}_${runId}`,
        scenarioId: tc.id,
        isTest: true,
        chiefComplaint: tc.chiefComplaint,
      });
      stored.stopReason = stopReason;
      stored.metadata = {
        rcReportId: reportId,
        variant: variant.label,
        llmConfig: {
          enabled: variant.llmEnabled,
          toneProfile: variant.toneProfile ?? null,
          temperature: 0,
        },
      };

      await getTraceStore().save(stored);

      const llmLogs = await getLlmCallLog().getByRunId(runId, 50);
      const tokensIn = llmLogs.reduce((s, l) => s + (l.tokensIn ?? 0), 0);
      const tokensOut = llmLogs.reduce((s, l) => s + (l.tokensOut ?? 0), 0);

      let hardFailures: CompareFailure[] = [];
      let softFailures: CompareFailure[] = [];
      let pass = true;

      if (tc.expected?.disposition && stored.normalized.disposition !== tc.expected.disposition) {
        const baseSafety = getDispositionSafetyLevel(tc.expected.disposition);
        const candSafety = getDispositionSafetyLevel(stored.normalized.disposition);
        if (candSafety > baseSafety) {
          hardFailures.push({
            code: "DISPOSITION_MISMATCH_UNSAFE",
            path: "disposition",
            details: `Expected ${tc.expected.disposition}, got ${stored.normalized.disposition}`,
            baseline: tc.expected.disposition,
            candidate: stored.normalized.disposition,
          });
        } else {
          softFailures.push({
            code: "DISPOSITION_MISMATCH_SAFE",
            path: "disposition",
            details: `Expected ${tc.expected.disposition}, got ${stored.normalized.disposition}`,
          });
        }
      }

      if (tc.expected?.redFlagsPresent) {
        const expectedSet = new Set(tc.expected.redFlagsPresent);
        const actualSet = new Set(stored.normalized.redFlags);
        for (const rf of expectedSet) {
          if (!actualSet.has(rf)) {
            hardFailures.push({ code: "EXPECTED_RED_FLAG_MISSING", path: "redFlags", details: `Missing: ${rf}` });
          }
        }
      }

      if (tc.expected?.scores) {
        for (const [k, v] of Object.entries(tc.expected.scores)) {
          if (stored.normalized.scores[k] !== v) {
            hardFailures.push({
              code: "SCORE_MISMATCH",
              path: `scores.${k}`,
              details: `Expected ${v}, got ${stored.normalized.scores[k] ?? "N/A"}`,
            });
          }
        }
      }

      if (variant.label !== "llm_off" && baselineNorm) {
        const crossCheck = compareNormalized(baselineNorm, stored.normalized);
        hardFailures.push(...crossCheck.hard);
        softFailures.push(...crossCheck.soft);
      }

      if (variant.label === "llm_off") {
        baselineNorm = stored.normalized;
      }

      const isEmergent = stored.normalized.disposition?.includes("ed") ||
        stored.stopReason === "EMERGENT";
      const answeredQIds = new Set<string>();
      for (const step of stored.steps) {
        const action = step.action as Record<string, unknown>;
        if ((action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") && action.questionId) {
          const outputs = step.outputs as Record<string, unknown>;
          if (outputs?.answer !== undefined) {
            answeredQIds.add(action.questionId as string);
          }
        }
      }
      const mdsResult = validateMinimumDataSet(tc.chiefComplaint, answeredQIds, isEmergent);
      if (mdsResult && !mdsResult.pass) {
        hardFailures.push({
          code: "MDS_INCOMPLETE",
          path: "minimumDataSet",
          details: `Required questions missing: ${mdsResult.requiredMissing.join(", ")} (${mdsResult.completionPct}% complete)`,
        });
      }

      pass = hardFailures.length === 0;
      const frictionCount = extractFrictionFromTrace(stored);

      results.push({
        scenarioId: tc.id,
        label: tc.label,
        variant: variant.label,
        runId,
        pass,
        disposition: stored.normalized.disposition,
        expectedDisposition: tc.expected?.disposition,
        hardFailures,
        softFailures,
        latencyMs,
        stepCount: stored.steps.length,
        tokensIn,
        tokensOut,
        frictionCount,
      });
    }
  }

  const passCount = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;

  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const latencyMean = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const totalTokensIn = results.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = results.reduce((s, r) => s + r.tokensOut, 0);
  const estimatedCostUsd = Number(((totalTokensIn * 0.00015 + totalTokensOut * 0.0006) / 1000).toFixed(4));

  const allHardDiffs = results.flatMap(r => r.hardFailures.map(f => ({ ...f, details: `[${r.scenarioId}/${r.variant}] ${f.details}` })));
  const allSoftDiffs = results.flatMap(r => r.softFailures.map(f => ({ ...f, details: `[${r.scenarioId}/${r.variant}] ${f.details}` })));
  const topDiffs = [...allHardDiffs, ...allSoftDiffs].slice(0, 10);

  const frictionRuns = results.filter(r => r.frictionCount > 0).length;
  const frictionRate = results.length > 0 ? Number((frictionRuns / results.length).toFixed(3)) : 0;

  const allRunIds = results.map(r => r.runId);
  const templateAgg = new Map<string, { callCount: number; totalLatency: number; tokensIn: number; tokensOut: number }>();
  for (const rid of allRunIds) {
    const logs = await getLlmCallLog().getByRunId(rid, 100);
    for (const log of logs) {
      const key = `${log.promptTemplateId}@${log.promptTemplateVersion ?? "unknown"}`;
      const existing = templateAgg.get(key) ?? { callCount: 0, totalLatency: 0, tokensIn: 0, tokensOut: 0 };
      existing.callCount++;
      existing.totalLatency += log.latencyMs;
      existing.tokensIn += log.tokensIn ?? 0;
      existing.tokensOut += log.tokensOut ?? 0;
      templateAgg.set(key, existing);
    }
  }

  const templateVersionDeltas: TemplateVersionDelta[] = [...templateAgg.entries()].map(([key, agg]) => {
    const [templateId, version] = key.split("@");
    return {
      templateId,
      version,
      callCount: agg.callCount,
      avgLatencyMs: agg.callCount > 0 ? Math.round(agg.totalLatency / agg.callCount) : 0,
      totalTokensIn: agg.tokensIn,
      totalTokensOut: agg.tokensOut,
    };
  });

  return {
    id: reportId,
    startedAt,
    completedAt: new Date().toISOString(),
    scenarioCount: testCases.length,
    variantCount: activeVariants.length,
    totalRuns: results.length,
    passCount,
    failCount,
    passRate: results.length > 0 ? Number((passCount / results.length).toFixed(3)) : 0,
    results,
    topDiffs,
    latency: {
      mean: latencyMean,
      median: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    tokens: { totalIn: totalTokensIn, totalOut: totalTokensOut, estimatedCostUsd },
    frictionRate,
    templateVersionDeltas,
  };
}

export function formatRcReport(report: RcReport): string {
  const lines: string[] = [];

  lines.push(`*RC Report: ${report.id}*`);
  lines.push("");

  const icon = report.failCount === 0 ? "PASS" : "FAIL";
  lines.push(`Result: ${icon} (${report.passCount}/${report.totalRuns} passed)`);
  lines.push(`Scenarios: ${report.scenarioCount} x ${report.variantCount} variants`);
  lines.push("");

  lines.push("*Latency*");
  lines.push(`  Mean: ${report.latency.mean}ms | Median: ${report.latency.median}ms | P95: ${report.latency.p95}ms`);
  lines.push("");

  lines.push("*Tokens & Cost*");
  lines.push(`  In: ${report.tokens.totalIn} | Out: ${report.tokens.totalOut}`);
  lines.push(`  Est. cost: $${report.tokens.estimatedCostUsd}`);
  lines.push("");

  lines.push(`*Friction Rate*: ${(report.frictionRate * 100).toFixed(1)}%`);
  lines.push("");

  if (report.topDiffs.length > 0) {
    lines.push(`*Top Diffs (${report.topDiffs.length})*`);
    for (const d of report.topDiffs.slice(0, 5)) {
      lines.push(`  [${d.code}] ${d.details}`);
    }
    lines.push("");
  }

  if (report.templateVersionDeltas && report.templateVersionDeltas.length > 0) {
    lines.push("*Template Versions*");
    for (const tv of report.templateVersionDeltas) {
      lines.push(`  ${tv.templateId}@${tv.version}: ${tv.callCount} calls, avg ${tv.avgLatencyMs}ms, ${tv.totalTokensIn}/${tv.totalTokensOut} tokens`);
    }
    lines.push("");
  }

  if (report.failCount > 0) {
    lines.push("*Failed Runs*");
    for (const r of report.results.filter(r => !r.pass)) {
      const fails = r.hardFailures.map(f => f.code).join(",");
      lines.push(`  ${r.scenarioId}/${r.variant}: ${fails}`);
    }
  }

  lines.push("");
  lines.push(`Time: ${report.startedAt} → ${report.completedAt}`);

  return lines.join("\n");
}
