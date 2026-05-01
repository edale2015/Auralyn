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

// 13-step pipeline definition
const PIPELINE_STEPS = [
  { step: 1,  name: "Complaint Identification",      ruleType: null            },
  { step: 2,  name: "Modifier Collection",           ruleType: "modifier"      },
  { step: 3,  name: "Core Questions",                ruleType: "question"      },
  { step: 4,  name: "Secondary Questions",           ruleType: "question"      },
  { step: 5,  name: "Red Flag Safety Screen",        ruleType: "red_flag"      },
  { step: 6,  name: "Cluster Scoring",               ruleType: "cluster_scoring"},
  { step: 7,  name: "Diagnosis Ranking",             ruleType: "diagnosis"     },
  { step: 8,  name: "Disposition Determination",     ruleType: "disposition"   },
  { step: 9,  name: "Workup Selection",              ruleType: "workup"        },
  { step: 10, name: "Medication Group Selection",    ruleType: "medication"    },
  { step: 11, name: "Medication Safety Filters",     ruleType: "medication"    },
  { step: 12, name: "Plan Generation",               ruleType: "plan"          },
  { step: 13, name: "Audit Trail",                   ruleType: null            },
];

function evaluateRule(rule: any, inputs: PipelineInputs): boolean {
  const logic = (rule.logic_type ?? "boolean") as string;
  const inputFields: string[] = rule.input_fields ?? [];
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
      const queryDeps: string[] = rule.question_dependencies ?? [];
      for (const dep of queryDeps) {
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
      if (queryDeps.length === 0) return true; // unconditional
      return queryDeps.some(dep => {
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
      if (hardStop && rule.safety_level !== "CRITICAL") continue; // short-circuit non-critical after hardstop

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
