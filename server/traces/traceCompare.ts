import type { StoredTrace } from "./traceStore";
import type { CompareFailure, CompareResponse } from "../../shared/testingTypes";

const DISPOSITION_SAFETY_ORDER = [
  "emergent",
  "ed",
  "urgent_or_ed",
  "urgent",
  "urgent_follow_up",
  "routine",
  "supportive",
  "self_care_with_precautions",
  "self_care",
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

export interface TraceDiffStep {
  step: number;
  status: "same" | "changed" | "added" | "removed";
  baseline?: { actionType: string; ruleRefs: string[]; outputKeys: string[] };
  candidate?: { actionType: string; ruleRefs: string[]; outputKeys: string[] };
  changes?: string[];
}

export interface TraceDiffResult extends CompareResponse {
  stepDiff: TraceDiffStep[];
  baselineRunId: string;
  candidateRunId: string;
}

export function compareTraces(baseline: StoredTrace, candidate: StoredTrace): TraceDiffResult {
  const hardFailures: CompareFailure[] = [];
  const softFailures: CompareFailure[] = [];

  const baseNorm = baseline.normalized;
  const candNorm = candidate.normalized;

  if (baseNorm.disposition !== candNorm.disposition) {
    const baseSafety = getDispositionSafetyLevel(baseNorm.disposition);
    const candSafety = getDispositionSafetyLevel(candNorm.disposition);

    if (baseSafety === -1 || candSafety === -1) {
      hardFailures.push({
        code: "UNKNOWN_DISPOSITION",
        path: "normalized.disposition",
        details: `Unknown disposition: baseline="${baseNorm.disposition}", candidate="${candNorm.disposition}"`,
        baseline: baseNorm.disposition,
        candidate: candNorm.disposition,
      });
    } else if (candSafety > baseSafety) {
      hardFailures.push({
        code: "DISPOSITION_CHANGED_UP",
        path: "normalized.disposition",
        details: `Disposition became less safe: ${baseNorm.disposition} -> ${candNorm.disposition}`,
        baseline: baseNorm.disposition,
        candidate: candNorm.disposition,
      });
    } else if (candSafety < baseSafety) {
      softFailures.push({
        code: "DISPOSITION_CHANGED_DOWN",
        path: "normalized.disposition",
        details: `Disposition became more conservative: ${baseNorm.disposition} -> ${candNorm.disposition}`,
        baseline: baseNorm.disposition,
        candidate: candNorm.disposition,
      });
    }
  }

  const baseRedFlags = new Set(baseNorm.redFlags || []);
  const candRedFlags = new Set(candNorm.redFlags || []);

  for (const rf of baseRedFlags) {
    if (!candRedFlags.has(rf)) {
      hardFailures.push({
        code: "RED_FLAG_REMOVED",
        path: "normalized.redFlags",
        details: `Red flag "${rf}" was removed`,
        baseline: Array.from(baseRedFlags),
        candidate: Array.from(candRedFlags),
      });
    }
  }

  for (const rf of candRedFlags) {
    if (!baseRedFlags.has(rf)) {
      softFailures.push({
        code: "RED_FLAG_ADDED",
        path: "normalized.redFlags",
        details: `Red flag "${rf}" was added (more conservative)`,
      });
    }
  }

  for (const [scoreKey, baseVal] of Object.entries(baseNorm.scores || {})) {
    const candVal = candNorm.scores?.[scoreKey];
    if (candVal !== undefined && candVal !== baseVal) {
      hardFailures.push({
        code: "SCORE_CHANGED",
        path: `normalized.scores.${scoreKey}`,
        details: `Score "${scoreKey}" changed: ${baseVal} -> ${candVal}`,
        baseline: baseVal,
        candidate: candVal,
      });
    }
  }

  const baseDx = baseNorm.dx || [];
  const candDx = candNorm.dx || [];
  const baseDxSet = new Set(baseDx);
  const candDxSet = new Set(candDx);
  const dxAdded = candDx.filter(d => !baseDxSet.has(d));
  const dxRemoved = baseDx.filter(d => !candDxSet.has(d));

  if (dxAdded.length > 0 || dxRemoved.length > 0) {
    softFailures.push({
      code: "DX_CHANGED",
      path: "normalized.dx",
      details: `Dx added: [${dxAdded.join(", ")}], removed: [${dxRemoved.join(", ")}]`,
      baseline: baseDx,
      candidate: candDx,
    });
  }

  const stepDelta = Math.abs(candidate.steps.length - baseline.steps.length);
  if (stepDelta > 3) {
    softFailures.push({
      code: "TRACE_STEP_COUNT_CHANGED",
      path: "steps.length",
      details: `Step count changed by ${stepDelta}: ${baseline.steps.length} -> ${candidate.steps.length}`,
      baseline: baseline.steps.length,
      candidate: candidate.steps.length,
    });
  }

  const stepDiff = buildStepDiff(baseline, candidate);

  return {
    pass: hardFailures.length === 0,
    hardFailures,
    softFailures,
    summary: { hard: hardFailures.length, soft: softFailures.length },
    stepDiff,
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
  };
}

function buildStepDiff(baseline: StoredTrace, candidate: StoredTrace): TraceDiffStep[] {
  const maxSteps = Math.max(baseline.steps.length, candidate.steps.length);
  const diff: TraceDiffStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const bStep = baseline.steps[i];
    const cStep = candidate.steps[i];

    if (bStep && cStep) {
      const bInfo = { actionType: bStep.action.type, ruleRefs: bStep.ruleRefs, outputKeys: Object.keys(bStep.outputs || {}) };
      const cInfo = { actionType: cStep.action.type, ruleRefs: cStep.ruleRefs, outputKeys: Object.keys(cStep.outputs || {}) };

      const changes: string[] = [];
      if (bInfo.actionType !== cInfo.actionType) changes.push(`action: ${bInfo.actionType} -> ${cInfo.actionType}`);
      if (JSON.stringify(bInfo.ruleRefs) !== JSON.stringify(cInfo.ruleRefs)) changes.push(`rules: [${bInfo.ruleRefs}] -> [${cInfo.ruleRefs}]`);
      if (JSON.stringify(bInfo.outputKeys) !== JSON.stringify(cInfo.outputKeys)) changes.push(`outputs: [${bInfo.outputKeys}] -> [${cInfo.outputKeys}]`);

      diff.push({
        step: i + 1,
        status: changes.length > 0 ? "changed" : "same",
        baseline: bInfo,
        candidate: cInfo,
        changes: changes.length > 0 ? changes : undefined,
      });
    } else if (bStep && !cStep) {
      diff.push({
        step: i + 1,
        status: "removed",
        baseline: { actionType: bStep.action.type, ruleRefs: bStep.ruleRefs, outputKeys: Object.keys(bStep.outputs || {}) },
      });
    } else if (!bStep && cStep) {
      diff.push({
        step: i + 1,
        status: "added",
        candidate: { actionType: cStep.action.type, ruleRefs: cStep.ruleRefs, outputKeys: Object.keys(cStep.outputs || {}) },
      });
    }
  }

  return diff;
}
