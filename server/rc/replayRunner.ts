import { randomUUID } from "crypto";
import { getTraceStore, agentRunResponseToStoredTrace, type StoredTrace } from "../traces/traceStore";
import { runAgentLoop, buildAgentRunResponse } from "../agent/runtime";
import { CaseStateSchema, AgentRunConfigSchema } from "../../shared/agentTypes";
import type { CompareFailure, NormalizedResult } from "../../shared/testingTypes";

export interface ReplayConfig {
  toneProfile?: string;
  llmEnabled?: boolean;
  model?: string;
  temperature?: number;
  seed?: number;
}

export interface ReplayResult {
  originalRunId: string;
  replayRunId: string;
  originalDisposition: string;
  replayDisposition: string;
  pass: boolean;
  hardFailures: CompareFailure[];
  softFailures: CompareFailure[];
  latencyMs: number;
  stepCount: number;
  replayConfig: ReplayConfig;
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
    if (candSafety > baseSafety) {
      hard.push({
        code: "DISPOSITION_CHANGED_UP",
        path: "disposition",
        details: `${baseline.disposition} → ${candidate.disposition}`,
        baseline: baseline.disposition,
        candidate: candidate.disposition,
      });
    } else if (candSafety < baseSafety) {
      soft.push({ code: "DISPOSITION_CHANGED_DOWN", path: "disposition", details: `${baseline.disposition} → ${candidate.disposition}` });
    }
  }

  const baseRedFlags = new Set(baseline.redFlags || []);
  const candRedFlags = new Set(candidate.redFlags || []);
  for (const rf of baseRedFlags) {
    if (!candRedFlags.has(rf)) {
      hard.push({ code: "RED_FLAG_REMOVED", path: "redFlags", details: `"${rf}" removed` });
    }
  }
  for (const rf of candRedFlags) {
    if (!baseRedFlags.has(rf)) {
      soft.push({ code: "RED_FLAG_ADDED", path: "redFlags", details: `"${rf}" added` });
    }
  }

  for (const [k, v] of Object.entries(baseline.scores || {})) {
    const candVal = candidate.scores?.[k];
    if (candVal !== undefined && candVal !== v) {
      hard.push({ code: "SCORE_CHANGED", path: `scores.${k}`, details: `${v} → ${candVal}` });
    }
  }

  return { hard, soft };
}

export async function replayRun(originalRunId: string, replayConfig: ReplayConfig): Promise<ReplayResult> {
  const original = await getTraceStore().getByRunId(originalRunId);
  if (!original) {
    throw new Error(`Original trace not found: ${originalRunId}`);
  }

  const answers: Record<string, unknown> = {};
  for (const step of original.steps) {
    const action = step.action as Record<string, unknown>;
    const outputs = step.outputs as Record<string, unknown>;

    if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
      const qId = action.questionId as string;
      if (qId && outputs.answer !== undefined) {
        answers[qId] = outputs.answer;
      }
    }

    if (action.type === "COMPUTE_SCORE" || action.type === "FLAG_RED_FLAG") {
      for (const inputKey of step.inputsUsed) {
        if (inputKey && outputs[inputKey] !== undefined) {
          answers[inputKey] = outputs[inputKey];
        }
      }
    }

    if (outputs.answersCollected && typeof outputs.answersCollected === "object") {
      Object.assign(answers, outputs.answersCollected);
    }
  }

  for (const step of original.steps) {
    for (const inputKey of step.inputsUsed) {
      if (inputKey && !(inputKey in answers)) {
        const outputs = step.outputs as Record<string, unknown>;
        if (outputs[inputKey] !== undefined) {
          answers[inputKey] = outputs[inputKey];
        }
      }
    }
  }

  const replayRunId = randomUUID();
  const now = new Date().toISOString();

  const stateData: Record<string, unknown> = {
    caseId: `replay_${replayRunId}`,
    createdAt: now,
    updatedAt: now,
    chiefComplaint: original.chiefComplaint,
    answers,
    routing: { state: "INTAKE_PENDING" },
  };

  const initialState = CaseStateSchema.parse(stateData);

  const cfg = AgentRunConfigSchema.parse({
    runId: replayRunId,
    mode: "REGRESSION",
    maxSteps: 20,
    llm: {
      enabled: replayConfig.llmEnabled ?? true,
      temperature: replayConfig.temperature ?? 0,
      ...(replayConfig.toneProfile ? { toneProfile: replayConfig.toneProfile } : {}),
      ...(replayConfig.seed !== undefined ? { seed: replayConfig.seed } : {}),
      ...(replayConfig.model ? { model: replayConfig.model } : {}),
    },
    options: { disableWrites: true, disableTwilio: true, disableFileUploads: true },
  });

  const t0 = Date.now();
  const { finalState, steps, events, stopReason } = await runAgentLoop(initialState, cfg);
  const latencyMs = Date.now() - t0;

  const response = buildAgentRunResponse(replayRunId, "staging", "replay", finalState, steps, events);
  const stored = agentRunResponseToStoredTrace(response, {
    caseId: `replay_${replayRunId}`,
    scenarioId: original.scenarioId,
    isTest: true,
    chiefComplaint: original.chiefComplaint,
  });
  stored.stopReason = stopReason;
  stored.metadata = {
    replayOf: originalRunId,
    replayConfig,
    llmConfig: {
      enabled: replayConfig.llmEnabled ?? true,
      toneProfile: replayConfig.toneProfile ?? null,
      temperature: replayConfig.temperature ?? 0,
      seed: replayConfig.seed ?? null,
      model: replayConfig.model ?? null,
    },
  };

  await getTraceStore().save(stored);

  const { hard: hardFailures, soft: softFailures } = compareNormalized(original.normalized, stored.normalized);

  return {
    originalRunId,
    replayRunId,
    originalDisposition: original.normalized.disposition,
    replayDisposition: stored.normalized.disposition,
    pass: hardFailures.length === 0,
    hardFailures,
    softFailures,
    latencyMs,
    stepCount: stored.steps.length,
    replayConfig,
  };
}
