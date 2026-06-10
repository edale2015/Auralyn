/**
 * ruleExecutionEngine.ts
 * 13-step clinical rule execution pipeline.
 * Executes kb_master_rules in order for a given complaint + patient inputs.
 * Pure logic — no LLM calls.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface PipelineInputs {
  [key: string]: string | number | boolean;
}

export interface StepResult {
  step:           number;
  name:           string;
  ruleType:       string;
  rulesEvaluated: number;
  rulesFired:     FiredRule[];
  outputs:        Record<string, any>;
  redFlagHit:     boolean;
  escalation:     string | null;
  summary:        string;
}

export interface FiredRule {
  rule_id:         string;
  rule_name:       string;
  safety_level:    string;
  logic_type:      string;
  outputs:         any;
  disposition_impact: string | null;
  confidence_weight: number;
}

export interface PipelineResult {
  ok:              boolean;
  complaint_id:    string;
  inputs:          PipelineInputs;
  executedAt:      string;
  hardStop:        boolean;
  hardStopReason:  string | null;
  finalDisposition: string | null;
  steps:           StepResult[];
  totalRulesFired: number;
  criticalFlagsHit: string[];
}

// Corrected 13-step pipeline definition
const PIPELINE_STEPS = [
  { step:  1,  name: "Complaint Identification",                   ruleType: null              },
  { step:  2,  name: "Differential Diagnosis / Rule-Out Targets",  ruleType: "diagnosis"       },
  { step:  3,  name: "Modifier Collection",                        ruleType: "modifier"        },
  { step:  4,  name: "Question Engine",                            ruleType: "question"        },
  { step:  5,  name: "Workup Selection",                           ruleType: "workup"          },
  { step:  6,  name: "Medication Selection / Safety",              ruleType: "medication"      },
  { step:  7,  name: "Safety Screen — Red Flags",                  ruleType: "red_flag"        },
  { step:  8,  name: "Cluster Scoring",                            ruleType: "cluster_scoring" },
  { step:  9,  name: "Diagnosis Ranking / Differential Refinement",ruleType: "diagnosis"       },
  { step: 10,  name: "Disposition + Plan",                         ruleType: "disposition"     },
  { step: 11,  name: "Plan Generation",                            ruleType: "plan"            },
  { step: 12,  name: "Output Summary / Physician Communication",   ruleType: null              },
  { step: 13,  name: "Audit Trail",                                ruleType: null              },
];

// Parse PostgreSQL array format {a,b,c} or JS array or comma string
function parseFields(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const s = String(raw).trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    return s.slice(1, -1).split(",").map(f => f.trim()).filter(Boolean);
  }
  return s ? s.split(",").map(f => f.trim()).filter(Boolean) : [];
}

function isTruthy(val: any): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number")  return val !== 0;
  const s = String(val).toLowerCase().trim();
  return s === "yes" || s === "true" || s === "1" || s === "present";
}

/**
 * Parse and evaluate a logic_description string of the form:
 *   "answers.FIELD == 'yes' && (answers.OTHER == 'yes' || ...) → explanation"
 *
 * Returns:
 *   true/false  — successfully evaluated the expression
 *   null        — expression could not be parsed (caller falls back)
 *
 * Safety: all `answers.FIELD` references are replaced with literal `true`/`false`
 * before evaluation. The resulting string is validated to contain only boolean
 * algebra tokens (&&, ||, !, (, ), true, false, whitespace) before execution.
 */
function evalLogicDescription(description: string, inputs: PipelineInputs): boolean | null {
  if (!description || !description.includes("answers.")) return null;

  // Take condition part only (before → which marks the human-readable explanation)
  let expr = description.split("→")[0].trim();

  // Replace   answers.FIELD == 'yes'  /  == "yes"  /  == true
  expr = expr.replace(
    /answers\.(\w+)\s*==\s*['"]?(yes|true)['"?]/g,
    (_, field) => {
      const v = inputs[field];
      return (v === true || v === "yes" || v === "true" || v === 1) ? "true" : "false";
    }
  );

  // Replace   answers.FIELD == 'no'  /  == "no"  /  == false
  expr = expr.replace(
    /answers\.(\w+)\s*==\s*['"]?(no|false)['"?]/g,
    (_, field) => {
      const v = inputs[field];
      return (!v || v === "no" || v === "false" || v === 0) ? "true" : "false";
    }
  );

  // Replace any remaining  answers.FIELD  bare references (treat as truthy check)
  expr = expr.replace(/answers\.(\w+)/g, (_, field) => {
    const v = inputs[field];
    return (v === true || v === "yes" || v === "true" || v === 1) ? "true" : "false";
  });

  // Validate: only boolean algebra tokens allowed after substitution
  // chars: t r u e f a l s (for true/false) + & | ! ( ) and whitespace
  if (/[^truefalse\s&|!()]/.test(expr)) return null;

  try {
    // eslint-disable-next-line no-new-func
    return !!new Function(`"use strict"; return (${expr})`)();
  } catch {
    return null;
  }
}

function evaluateRule(rule: any, inputs: PipelineInputs): boolean {
  const logic = (rule.logic_type ?? "boolean") as string;
  // input_fields is the primary trigger set; fall back to question_dependencies
  const parsedInputFields: string[] = parseFields(rule.input_fields);
  const inputFields: string[] = parsedInputFields.length > 0
    ? parsedInputFields
    : (rule.question_dependencies ?? []);
  const description: string   = rule.logic_description ?? "";

  switch (logic) {
    case "threshold": {
      // Parse simple threshold from description or input_fields
      for (const field of inputFields) {
        const val = inputs[field];
        if (val === undefined) continue;
        // Look for < or > in description
        const ltMatch = description.match(new RegExp(field + "\\s*<\\s*([\\d.]+)"));
        const gtMatch = description.match(new RegExp(field + "\\s*>\\s*([\\d.]+)"));
        const geMatch = description.match(new RegExp(field + "\\s*>=\\s*([\\d.]+)"));
        if (ltMatch && Number(val) < Number(ltMatch[1])) return true;
        if (gtMatch && Number(val) > Number(gtMatch[1])) return true;
        if (geMatch && Number(val) >= Number(geMatch[1])) return true;
      }
      // Also check query deps
      const queryDepsT: string[] = rule.question_dependencies ?? [];
      for (const dep of queryDepsT) {
        const val = inputs[dep];
        if (val !== undefined) {
          const m = dep.match(/^([a-z_]+)([<>]=?)([0-9.]+)$/i);
          if (m) {
            const field = m[1], op = m[2], threshold = Number(m[3]);
            const fv = Number(inputs[field] ?? val);
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
      const queryDeps: string[] = rule.question_dependencies ?? [];
      const hasStructuredDeps = queryDeps.length > 0 || parsedInputFields.length > 0;

      if (!hasStructuredDeps) {
        // No structured deps — try to evaluate the logic_description expression.
        // This handles rules that encode their conditions in prose rather than
        // question_dependencies (e.g. most chest-pain red-flag rules in the DB).
        const descResult = evalLogicDescription(description, inputs);
        if (descResult !== null) return descResult;

        // Could not parse — apply safe default:
        // red_flag / CRITICAL rules MUST NOT fire without evidence (false negative
        // is safer than a false positive escalation on every patient).
        if (rule.rule_type === "red_flag" || rule.safety_level === "CRITICAL") return false;

        // Other rule types (diagnosis, workup, medication) fire unconditionally
        // when underdefined — they are informational, not escalating.
        return true;
      }

      // Structured deps exist — evaluate normally
      const effectiveDeps = parsedInputFields.length > 0 ? parsedInputFields : queryDeps;
      return effectiveDeps.some(dep => {
        const v = inputs[dep];
        return v === true || v === "yes" || v === "true" || v === 1;
      });
    }
    case "scoring": {
      // Scoring rules always "fire" to contribute their score
      const queryDeps: string[] = rule.question_dependencies ?? [];
      return queryDeps.length === 0 ||
        queryDeps.some(dep => {
          const v = inputs[dep];
          return v === true || v === "yes" || v === "true" || v === 1;
        });
    }
    case "mapping": {
      // Mapping rules fire if no blocking conditions
      const modDeps: string[] = rule.modifier_dependencies ?? [];
      return modDeps.every(dep => {
        if (dep.startsWith("no_")) {
          const allergyKey = dep.replace("no_", "");
          return !inputs[allergyKey] && !inputs["allergy_" + allergyKey];
        }
        return true;
      });
    }
    case "conditional": {
      const queryDeps: string[] = rule.question_dependencies ?? [];
      const modDeps:   string[] = rule.modifier_dependencies ?? [];
      const hasQuery   = queryDeps.length === 0 || queryDeps.some(d => inputs[d] !== undefined);
      const hasModifier = modDeps.length === 0 || modDeps.some(d => {
        const v = inputs[d] ?? inputs[d.replace(/>.*/, "").trim()];
        return v !== undefined;
      });
      return hasQuery && hasModifier;
    }
    default:
      return false;
  }
}

export async function executePipeline(
  complaint_id: string,
  inputs: PipelineInputs
): Promise<PipelineResult> {
  const executedAt = new Date().toISOString();
  const allOutputs: Record<string, any> = { complaint_id, ...inputs };
  const criticalFlagsHit: string[] = [];
  let hardStop    = false;
  let hardStopReason: string | null = null;
  let finalDisposition: string | null = null;
  let totalFired  = 0;
  const steps: StepResult[] = [];

  // Load ALL rules for this complaint (or ALL complaints)
  const { rows } = await db.execute(sql`
    SELECT * FROM kb_master_rules
    WHERE active = true
      AND (complaint_id = ${complaint_id} OR complaint_id = 'ALL'
           OR complaint_id ILIKE ${'%' + complaint_id + '%'})
    ORDER BY priority ASC, safety_level DESC
  `);

  // Step 1: Complaint identification (no rules, just register)
  steps.push({
    step: 1, name: "Complaint Identification", ruleType: "—",
    rulesEvaluated: 0, rulesFired: [],
    outputs: { complaint_id },
    redFlagHit: false, escalation: null,
    summary: `Complaint registered: ${complaint_id}`,
  });

  // Steps 2–12: execute by rule_type in pipeline order
  for (const pipeStep of PIPELINE_STEPS.slice(1, 12)) {
    if (!pipeStep.ruleType) continue;

    // Step 11 (medication safety) reuses medication rules with priority > 6
    const stepRules = (rows as any[]).filter(r => {
      if (r.rule_type !== pipeStep.ruleType) return false;
      if (pipeStep.step === 3) return r.rule_type === "question" && (r.priority <= 4);
      if (pipeStep.step === 4) return r.rule_type === "question" && (r.priority > 4);
      if (pipeStep.step === 10) return r.rule_type === "medication" && r.is_first_line !== false;
      if (pipeStep.step === 11) return r.rule_type === "medication"; // safety re-check
      return true;
    });

    const firedRules: FiredRule[] = [];
    const stepOutputs: Record<string, any> = {};
    let stepRedFlag = false;
    let stepEscalation: string | null = null;

    for (const rule of stepRules) {
      // A red-flag hard stop FLAGS the case (hardStop/escalation/finalDisposition
      // are already recorded above) but must NOT terminate the pipeline. Every
      // downstream stage still evaluates its rules so the physician receives the
      // full differential / workup / disposition for an escalated case — not a
      // bare escalation stub. The hard stop never gets downgraded: finalDisposition
      // is guarded by `!finalDisposition` and red-flag rules only escalate further.
      const fires = evaluateRule(rule, { ...allOutputs, ...inputs });
      if (fires) {
        firedRules.push({
          rule_id:          rule.rule_id,
          rule_name:        rule.rule_name,
          safety_level:     rule.safety_level,
          logic_type:       rule.logic_type,
          outputs:          rule.outputs,
          disposition_impact: rule.disposition_impact,
          confidence_weight: rule.confidence_weight,
        });

        // Merge outputs into global state
        if (rule.outputs && typeof rule.outputs === "object") {
          Object.assign(stepOutputs, rule.outputs);
          Object.assign(allOutputs, rule.outputs);
        }

        // Red flag escalation
        if (rule.rule_type === "red_flag") {
          stepRedFlag = true;
          const impact = rule.disposition_impact ?? rule.outputs?.escalation;
          if (impact && ["ER_NOW","ED_NOW","CALL_911"].includes(impact)) {
            hardStop = true;
            hardStopReason = `${rule.rule_name}: ${rule.logic_description}`;
            stepEscalation = impact;
            finalDisposition = impact;
            criticalFlagsHit.push(rule.rule_id);
          }
        }

        // Track disposition
        if (rule.rule_type === "disposition" && rule.disposition_impact && !finalDisposition) {
          finalDisposition = rule.disposition_impact;
        }

        totalFired++;
      }
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
      outputs:        stepOutputs,
      redFlagHit:     stepRedFlag,
      escalation:     stepEscalation,
      summary,
    });
  }

  // Step 12: Output Summary / Physician Communication
  steps.push({
    step: 12, name: "Output Summary / Physician Communication", ruleType: "summary",
    rulesEvaluated: 0, rulesFired: [],
    outputs: {
      finalDisposition:   finalDisposition ?? "HOME_CARE",
      totalRulesFired:    totalFired,
      criticalFlagsHit,
      hardStop,
      patientSummary:     hardStop
        ? `URGENT: ${hardStopReason ?? "Critical flag hit"} — immediate escalation required.`
        : `Assessment complete. Recommended disposition: ${finalDisposition ?? "HOME_CARE"}. Awaiting physician review.`,
    },
    redFlagHit:  hardStop,
    escalation:  finalDisposition,
    summary:     hardStop
      ? `Escalation → ${finalDisposition}. ${totalFired} rules fired. Physician communication prepared.`
      : `Assessment complete. Disposition: ${finalDisposition ?? "HOME_CARE"}. ${totalFired} rules fired.`,
  });

  // Step 13: Audit (summarize)
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

  // ── Fix 3: Cough SOB over-escalation guard ────────────────────────────────
  // SOB alone with cough does NOT warrant ER. Requires at least one of:
  // O2 sat < 94%, resp rate > 24, stridor, cyanosis, or inability to speak.
  // If the ONLY hardStop trigger was an SOB rule and none of those are present,
  // downgrade from ER_NOW → URGENT_CARE.
  if (complaint_id === "cough" && hardStop && criticalFlagsHit.length > 0) {
    const criticalRules = (rows as any[]).filter(r => criticalFlagsHit.includes(r.rule_id));
    const allSobOnly = criticalRules.every(r => {
      const desc = ((r.logic_description ?? "") + (r.rule_name ?? "")).toLowerCase();
      return desc.includes("sob") || desc.includes("shortness") || desc.includes("breath");
    });
    const hasCriticalCriteria =
      (typeof inputs["Q_C_O2_SAT"]      === "number" && (inputs["Q_C_O2_SAT"] as number) < 94) ||
      (typeof inputs["Q_C_RESP_RATE"]    === "number" && (inputs["Q_C_RESP_RATE"] as number) > 24) ||
      inputs["Q_C_STRIDOR"]             === "yes" || inputs["Q_C_STRIDOR"]    === true ||
      inputs["Q_C_CYANOSIS"]            === "yes" || inputs["Q_C_CYANOSIS"]   === true ||
      inputs["Q_C_SPEECH_IMPAIRED"]     === "yes" || inputs["Q_C_SPEECH_IMPAIRED"] === true ||
      inputs["Q_C_UNABLE_TO_SPEAK"]     === "yes";

    if (allSobOnly && !hasCriticalCriteria) {
      hardStop         = false;
      hardStopReason   = null;
      finalDisposition = "URGENT_CARE";
      const auditStep  = steps.find(s => s.step === 13);
      if (auditStep) {
        auditStep.outputs.hardStop          = false;
        auditStep.outputs.hardStopReason    = null;
        auditStep.outputs.finalDisposition  = "URGENT_CARE";
        auditStep.summary = `Pipeline complete (SOB-only ER downgraded → URGENT_CARE). ${totalFired} rules fired.`;
      }
    }
  }

  return {
    ok: true,
    complaint_id,
    inputs,
    executedAt,
    hardStop,
    hardStopReason,
    finalDisposition: finalDisposition ?? "HOME_CARE",
    steps,
    totalRulesFired: totalFired,
    criticalFlagsHit,
  };
}

// ─── Pipeline structure (for GET /api/master-rules/pipeline/:complaint_id) ────

export async function getPipelineStructure(complaintId: string): Promise<{
  pipeline: Array<{ step: number; stepName: string; ruleType: string; count: number; criticalCount: number }>;
  totalRules: number;
  complaintId: string;
}> {
  const { rows } = await db.execute(sql`
    SELECT rule_type,
           COUNT(*)                                           AS cnt,
           COUNT(*) FILTER (WHERE safety_level = 'CRITICAL') AS critical_cnt
    FROM kb_master_rules
    WHERE active = true
      AND (complaint_id = ${complaintId} OR complaint_id = 'ALL' OR complaint_id IS NULL)
    GROUP BY rule_type
  `);

  const countByType = new Map<string, { cnt: number; critical: number }>();
  for (const row of rows as any[]) {
    countByType.set(row.rule_type, { cnt: Number(row.cnt), critical: Number(row.critical_cnt) });
  }

  const totalRules = [...countByType.values()].reduce((n, v) => n + v.cnt, 0);

  // Deduplicate step 3/4 (both question) and 10/11 (both medication)
  const seen = new Set<string>();
  const pipeline = PIPELINE_STEPS
    .filter(s => s.ruleType && !seen.has(s.ruleType) && (seen.add(s.ruleType), true))
    .filter(s => s.step !== 1 && s.step !== 13)
    .map(s => ({
      step:          s.step,
      stepName:      s.name,
      ruleType:      s.ruleType!,
      count:         countByType.get(s.ruleType!)?.cnt ?? 0,
      criticalCount: countByType.get(s.ruleType!)?.critical ?? 0,
    }))
    .filter(s => s.count > 0);

  return { pipeline, totalRules, complaintId };
}
