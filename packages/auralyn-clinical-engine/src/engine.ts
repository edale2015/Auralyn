/**
 * engine.ts — Auralyn Clinical Rule Execution Engine
 *
 * DB-free, framework-agnostic implementation of the 13-step clinical pipeline.
 * Pass in a rules array (from your own DB, JSON file, or test fixtures) and
 * patient inputs; get back a fully-traced PipelineResult.
 *
 * Usage:
 *   import { executePipeline } from "@auralyn/clinical-engine";
 *
 *   const result = executePipeline("chest_pain", rules, {
 *     O2_sat: 88,
 *     chest_pain_present: true,
 *     diaphoresis: true,
 *   });
 */

import {
  type MasterRule,
  type PipelineInputs,
  type PipelineResult,
  type StepResult,
  type FiredRule,
} from "./types";
import { PIPELINE_STEPS, HARD_STOP_CODES } from "./pipeline";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseFields(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as unknown[]).map(String).filter(Boolean);
  const s = String(raw).trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    return s.slice(1, -1).split(",").map(f => f.trim()).filter(Boolean);
  }
  return s ? s.split(",").map(f => f.trim()).filter(Boolean) : [];
}

function isTruthy(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number")  return val !== 0;
  const s = String(val).toLowerCase().trim();
  return s === "yes" || s === "true" || s === "1" || s === "present";
}

// ─── Rule evaluator ───────────────────────────────────────────────────────────

/**
 * Determines whether a single rule fires given the current patient input state.
 *
 * Logic types:
 *   boolean    — fires if any question_dependency is truthy (or unconditional if none)
 *   threshold  — fires if a numeric field crosses the threshold in logic_description
 *   scoring    — always fires (contributes score); used in cluster_scoring steps
 *   mapping    — fires unless a blocking modifier_dependency (prefixed "no_") is set
 *   conditional — fires if at least one question dep AND one modifier dep are present
 */
export function evaluateRule(rule: MasterRule, inputs: PipelineInputs): boolean {
  const logic = rule.logic_type ?? "boolean";

  const inputFields = parseFields(rule.input_fields).length > 0
    ? parseFields(rule.input_fields)
    : parseFields(rule.question_dependencies);
  const description = rule.logic_description ?? "";

  switch (logic) {
    case "threshold": {
      for (const field of inputFields) {
        const val = inputs[field];
        if (val === undefined) continue;
        const ltMatch = description.match(new RegExp(field + "\\s*<\\s*([\\d.]+)"));
        const gtMatch = description.match(new RegExp(field + "\\s*>\\s*([\\d.]+)"));
        const geMatch = description.match(new RegExp(field + "\\s*>=\\s*([\\d.]+)"));
        const leMatch = description.match(new RegExp(field + "\\s*<=\\s*([\\d.]+)"));
        if (ltMatch && Number(val) < Number(ltMatch[1])) return true;
        if (gtMatch && Number(val) > Number(gtMatch[1])) return true;
        if (geMatch && Number(val) >= Number(geMatch[1])) return true;
        if (leMatch && Number(val) <= Number(leMatch[1])) return true;
      }
      const queryDeps = parseFields(rule.question_dependencies);
      for (const dep of queryDeps) {
        const val = inputs[dep];
        if (val !== undefined) {
          const m = dep.match(/^([a-z_]+)([<>]=?)([0-9.]+)$/i);
          if (m) {
            const [, f, op, t] = m;
            const fv = Number(inputs[f] ?? val);
            const threshold = Number(t);
            if (op === "<"  && fv < threshold)  return true;
            if (op === "<=" && fv <= threshold) return true;
            if (op === ">"  && fv > threshold)  return true;
            if (op === ">=" && fv >= threshold) return true;
          }
        }
      }
      return false;
    }

    case "boolean": {
      const queryDeps = parseFields(rule.question_dependencies);
      if (queryDeps.length === 0) return true;
      return queryDeps.some(dep => isTruthy(inputs[dep]));
    }

    case "scoring": {
      const queryDeps = parseFields(rule.question_dependencies);
      return queryDeps.length === 0 || queryDeps.some(dep => isTruthy(inputs[dep]));
    }

    case "mapping": {
      const modDeps = parseFields(rule.modifier_dependencies);
      return modDeps.every(dep => {
        if (dep.startsWith("no_")) {
          const key = dep.replace("no_", "");
          return !isTruthy(inputs[key]) && !isTruthy(inputs[`allergy_${key}`]);
        }
        return true;
      });
    }

    case "conditional": {
      const queryDeps = parseFields(rule.question_dependencies);
      const modDeps   = parseFields(rule.modifier_dependencies);
      const hasQuery  = queryDeps.length === 0 || queryDeps.some(d => inputs[d] !== undefined);
      const hasMod    = modDeps.length === 0    || modDeps.some(d => inputs[d] !== undefined);
      return hasQuery && hasMod;
    }

    default:
      return false;
  }
}

// ─── Main pipeline executor ───────────────────────────────────────────────────

/**
 * Run the 13-step clinical pipeline against a set of patient inputs.
 *
 * @param complaintId  Chief complaint identifier (e.g. "chest_pain", "sore_throat")
 * @param rules        Active rules for this complaint from kb_master_rules
 * @param inputs       Patient-provided answers and vitals (key → value)
 * @returns            Fully-traced PipelineResult with per-step detail
 *
 * @example
 * const result = executePipeline("chest_pain", rules, {
 *   O2_sat: 88,
 *   chest_pain_present: "yes",
 *   diaphoresis: true,
 * });
 * if (result.hardStop) console.log("ESCALATE:", result.hardStopReason);
 */
export function executePipeline(
  complaintId: string,
  rules: MasterRule[],
  inputs: PipelineInputs,
): PipelineResult {
  const executedAt = new Date().toISOString();
  const allOutputs: Record<string, unknown> = { complaint_id: complaintId, ...inputs };
  const criticalFlagsHit: string[] = [];
  let hardStop        = false;
  let hardStopReason: string | null = null;
  let finalDisposition: string | null = null;
  let totalFired      = 0;
  const steps: StepResult[] = [];

  // Step 1 — Complaint Identification (no rules, just register)
  steps.push({
    step: 1, name: "Complaint Identification", ruleType: "—",
    rulesEvaluated: 0, rulesFired: [],
    outputs: { complaint_id: complaintId },
    redFlagHit: false, escalation: null,
    summary: `Complaint registered: ${complaintId}`,
  });

  // Steps 2–11 — execute each pipeline step
  for (const pipeStep of PIPELINE_STEPS.slice(1, 11)) {
    if (!pipeStep.ruleType) continue;

    const stepRules = rules.filter(r => {
      if (r.rule_type !== pipeStep.ruleType) return false;
      // Step 4 (core questions) = priority ≤ 4; Step 5 (secondary questions) = priority > 4
      if (pipeStep.step === 3) return r.rule_type === "question" && r.priority <= 4;
      if (pipeStep.step === 4) return r.rule_type === "question" && r.priority > 4;
      return true;
    });

    const firedRules: FiredRule[] = [];
    const stepOutputs: Record<string, unknown> = {};
    let stepRedFlag = false;
    let stepEscalation: string | null = null;

    for (const rule of stepRules) {
      // After a hard stop, only run CRITICAL-level rules
      if (hardStop && rule.safety_level !== "CRITICAL") continue;

      const fires = evaluateRule(rule, { ...allOutputs, ...inputs } as PipelineInputs);
      if (!fires) continue;

      firedRules.push({
        rule_id:            rule.rule_id,
        rule_name:          rule.rule_name,
        safety_level:       rule.safety_level,
        logic_type:         rule.logic_type,
        outputs:            rule.outputs ?? {},
        disposition_impact: rule.disposition_impact,
        confidence_weight:  rule.confidence_weight,
      });

      if (rule.outputs && typeof rule.outputs === "object") {
        Object.assign(stepOutputs, rule.outputs);
        Object.assign(allOutputs, rule.outputs);
      }

      if (rule.rule_type === "red_flag") {
        stepRedFlag = true;
        const impact = rule.disposition_impact ?? (rule.outputs?.escalation as string | undefined);
        if (impact && HARD_STOP_CODES.has(impact)) {
          hardStop       = true;
          hardStopReason = `${rule.rule_name}: ${rule.logic_description}`;
          stepEscalation = impact;
          finalDisposition = impact;
          criticalFlagsHit.push(rule.rule_id);
        }
      }

      if (rule.rule_type === "disposition" && rule.disposition_impact && !finalDisposition) {
        finalDisposition = rule.disposition_impact;
      }

      totalFired++;
    }

    Object.assign(allOutputs, stepOutputs);

    let summary = `Evaluated ${stepRules.length} ${pipeStep.ruleType} rules → ${firedRules.length} fired`;
    if (stepEscalation) summary += ` ⚠ ESCALATE: ${stepEscalation}`;

    steps.push({
      step:           pipeStep.step,
      name:           pipeStep.name,
      ruleType:       pipeStep.ruleType,
      rulesEvaluated: stepRules.length,
      rulesFired:     firedRules,
      outputs:        stepOutputs as Record<string, any>,
      redFlagHit:     stepRedFlag,
      escalation:     stepEscalation,
      summary,
    });
  }

  // Step 13 — Audit Trail
  steps.push({
    step: 13, name: "Audit Trail", ruleType: "audit",
    rulesEvaluated: 0, rulesFired: [],
    outputs: {
      hardStop,
      hardStopReason,
      finalDisposition: finalDisposition ?? "HOME_CARE",
      totalFired,
      criticalFlagsHit,
    },
    redFlagHit: hardStop,
    escalation: finalDisposition,
    summary: hardStop
      ? `HARD STOP — ${hardStopReason} → ${finalDisposition}`
      : `Pipeline complete. ${totalFired} rules fired. Disposition: ${finalDisposition ?? "HOME_CARE"}`,
  });

  return {
    ok: true,
    complaint_id:     complaintId,
    inputs,
    executedAt,
    hardStop,
    hardStopReason,
    finalDisposition: (finalDisposition ?? "HOME_CARE") as PipelineResult["finalDisposition"],
    steps,
    totalRulesFired:  totalFired,
    criticalFlagsHit,
  };
}

// ─── Utility: score confidence across fired rules ─────────────────────────────

/**
 * Compute a weighted confidence score across all fired rules in a result.
 * Weights are drawn from the `confidence_weight` column (0.0–1.0).
 */
export function computeConfidence(result: PipelineResult): number {
  const allFired = result.steps.flatMap(s => s.rulesFired);
  if (allFired.length === 0) return 0;
  const sum = allFired.reduce((acc, r) => acc + (r.confidence_weight ?? 0.5), 0);
  return Math.min(1, sum / allFired.length);
}

/**
 * Extract the top-N diagnosis candidates from a pipeline result,
 * ranked by how many diagnosis rules fired and their confidence weights.
 */
export function extractTopDiagnoses(result: PipelineResult, n = 3): string[] {
  const diagnosisStep = result.steps.find(s => s.step === 9);
  if (!diagnosisStep) return [];
  return diagnosisStep.rulesFired
    .sort((a, b) => b.confidence_weight - a.confidence_weight)
    .slice(0, n)
    .map(r => r.rule_name);
}
