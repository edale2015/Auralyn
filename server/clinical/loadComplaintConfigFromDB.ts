/**
 * F001 — DB-fallback complaint config loader.
 *
 * Reads kb_master_rules (8,413 active rules, 1,025 complaints) and returns a
 * ComplaintConfig shaped identically to what the Sheets loader produces.
 * Called automatically by loadComplaintConfig() when Sheets is unavailable.
 *
 * Emit: auralyn.context.config_fallback_used
 * Sets: staleConfig = true on the pipeline result (done in the caller).
 */

import { db }         from "../db";
import { sql }        from "drizzle-orm";
import { emitMetric } from "../context/telemetry";

import type {
  ComplaintConfig,
  ComplaintRegistryEntry,
  RedFlagRule,
  CoreQuestion,
  DispositionRule,
  DxCandidateRow,
  ClusterScoringRule,
  ScoringDef,
  OutputTemplate,
  WorldBRow,
} from "../services/complaintConfigLoader";

// ─── helpers ──────────────────────────────────────────────────────────────────

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function parseNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function jf(v: unknown): any {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return null; }
}

// ─── Row mappers (one per rule_type) ─────────────────────────────────────────

function rowToRedFlag(r: any, ccId: string): RedFlagRule | null {
  const id = norm(r.rule_id);
  if (!id) return null;
  const isHard = norm(r.safety_level).toUpperCase() === "CRITICAL";
  const outputs = jf(r.outputs) ?? {};
  // logic_description is stored as "trigger_expr → rationale"
  const [triggerExpr = "true"] = norm(r.logic_description).split(" → ");
  return {
    ccId,
    rfId:            id,
    label:           norm(r.rule_name),
    triggerExpr:     triggerExpr.trim() || "true",
    severity:        isHard ? "HARD" : "SOFT",
    action:          norm(outputs.escalation ?? r.disposition_impact ?? "ESCALATE"),
    immediateActions:norm(outputs.immediate_actions ?? ""),
    rationale:       norm(outputs.rationale ?? r.notes ?? ""),
  };
}

function rowToCoreQuestion(r: any, ccId: string): CoreQuestion | null {
  const id = norm(r.rule_id);
  if (!id) return null;
  return {
    ccId,
    version:      1,
    qId:          id,
    askOrder:     parseNumber(r.priority, 50),
    questionText: norm(r.rule_name).replace(/^Q:\s*/, ""),
    answerType:   "tri",
    required:     false,
    askIf:        norm(r.logic_description) || "true",
    category:     norm(r.notes ?? "general") || "general",
  };
}

function rowToDispositionRule(r: any, ccId: string): DispositionRule | null {
  const id = norm(r.rule_id);
  if (!id) return null;
  return {
    ccId,
    dispRuleId:          id,
    priority:            parseNumber(r.priority, 50),
    whenExpr:            norm(r.logic_description) || "true",
    dispositionLevel:    norm(r.disposition_impact ?? "routine").toLowerCase() || "routine",
    rationaleTemplateId: "",
    confidenceHint:      norm(r.safety_level).toUpperCase() === "CRITICAL" ? "HIGH"
                       : norm(r.safety_level).toUpperCase() === "HIGH"     ? "HIGH"
                       : "MODERATE",
  };
}

function rowToDxCandidate(r: any, ccId: string): DxCandidateRow | null {
  const outputs = jf(r.outputs) ?? {};
  const dxId    = norm(outputs.diagnosis_id ?? r.diagnosis_id ?? r.rule_id);
  if (!dxId) return null;
  const baseProbability = parseNumber(outputs.base_probability, 0.3);
  return {
    CC_ID:           ccId,
    DX_ID:           dxId,
    DX_LABEL:        norm(outputs.diagnosis_label ?? r.rule_name),
    BEST_CLUSTER_ID: norm(r.cluster_id ?? ""),
    BASE_POINTS:     Math.round(baseProbability * 100),
    CLUSTER_PRIORITY:parseNumber(r.priority, 50),
    BASE_SCORE:      Math.round(baseProbability * 100),
    RANK:            parseNumber(r.priority, 50),
  };
}

function rowToClusterScoring(r: any, ccId: string): ClusterScoringRule | null {
  const id = norm(r.rule_id);
  if (!id) return null;
  const outputs = jf(r.outputs) ?? {};
  return {
    ccId,
    clusterId:     norm(r.cluster_id ?? outputs.cluster_id ?? ""),
    ruleId:        id,
    points:        parseNumber(outputs.points ?? r.confidence_weight, 1),
    whenExpr:      norm(r.logic_description) || "true",
    evidenceLabel: norm(r.rule_name),
  };
}

function rowToOutputTemplate(r: any, ccId: string): OutputTemplate | null {
  const id = norm(r.rule_id);
  if (!id) return null;
  const outputs = jf(r.outputs) ?? {};
  return {
    ccId,
    templateId: id,
    label:      norm(r.rule_name),
    channel:    "all",
    body:       norm(outputs.template_text ?? r.notes ?? ""),
  };
}

function rowToWorldBRow(r: any, tableName: string): WorldBRow {
  const outputs = jf(r.outputs) ?? {};
  return {
    __sourceTable:    tableName,
    MED_GROUP:        norm(outputs.medication_group ?? r.rule_name),
    WHEN_EXPR:        norm(r.logic_description) || "true",
    INTERVENTION:     norm(outputs.test_name ?? r.rule_name),
    MEDICATION_NAME:  norm(outputs.medication_name ?? ""),
    ADULT_DOSE:       norm(outputs.adult_dose ?? r.medication_impact ?? ""),
    CONTRAINDICATIONS:norm(outputs.contraindications ?? ""),
    ROUTE:            norm(outputs.route ?? ""),
    IS_FIRST_LINE:    String(outputs.is_first_line ?? "false"),
  };
}

// ─── Registry builder ─────────────────────────────────────────────────────────
// The COMPLAINT_REGISTRY is Sheets-only; construct a synthetic entry from
// the complaint_id and aggregate rule counts from kb_master_rules.

function buildRegistry(ccId: string): ComplaintRegistryEntry {
  return {
    ccId,
    system:              ccId.split("_")[0] ?? "general",
    label:               ccId.replace(/_/g, " "),
    version:             1,
    coreQuestionsVersion:1,
    redFlagSetId:        `${ccId}_rf`,
    scoringId:           `${ccId}_scoring`,
    dispositionSetId:    `${ccId}_disp`,
    outputTemplateSetId: `${ccId}_tmpl`,
    defaultCluster:      "",
    // Marker checked by pipeline to set staleConfig = true
    scoringModule:       "db_fallback",
    graphId:             "",
    enabled:             true,
    engineType:          "GENERIC_V1",
    aliases:             [],
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function loadComplaintConfigFromDB(
  ccId: string,
): Promise<ComplaintConfig | null> {
  const key = ccId.toLowerCase().trim().replace(/[\s-]+/g, "_");

  const { rows } = await db.execute(sql`
    SELECT
      rule_id, rule_name, rule_type, priority,
      complaint_id, cluster_id, diagnosis_id,
      logic_description, logic_type,
      outputs, disposition_impact, medication_impact, workup_impact,
      safety_level, confidence_weight, notes, active
    FROM kb_master_rules
    WHERE active = true
      AND (
        complaint_id = ${key}
        OR complaint_id = 'ALL'
        OR complaint_id IS NULL
      )
    ORDER BY priority ASC
    LIMIT 2000
  `);

  const all = rows as any[];

  // Filter: prefer complaint-scoped rows; fall back to globals only if
  // the complaint has zero scoped rules of that type.
  const scoped  = all.filter(r => norm(r.complaint_id).toLowerCase() === key);
  const globals = all.filter(r => {
    const c = norm(r.complaint_id).toLowerCase();
    return c === "all" || c === "";
  });

  if (scoped.length === 0 && globals.length === 0) {
    console.warn(`[loadComplaintConfigFromDB] No rules found for "${key}"`);
    return null;
  }

  // Use scoped rows; supplement each rule_type with globals only when the
  // complaint has no scoped rows of that type.
  const scopedTypes = new Set(scoped.map(r => norm(r.rule_type)));
  const supplementGlobals = globals.filter(r => !scopedTypes.has(norm(r.rule_type)));
  const effective = [...scoped, ...supplementGlobals];

  const byType = (t: string) => effective.filter(r => norm(r.rule_type) === t);

  const redFlagRules     = byType("red_flag").map(r => rowToRedFlag(r, key)).filter((x): x is RedFlagRule => x !== null);
  const coreQuestions    = byType("question").map(r => rowToCoreQuestion(r, key)).filter((x): x is CoreQuestion => x !== null).sort((a, b) => a.askOrder - b.askOrder);
  const dispositionRules = byType("disposition").map(r => rowToDispositionRule(r, key)).filter((x): x is DispositionRule => x !== null).sort((a, b) => a.priority - b.priority);
  const dxCandidates     = byType("diagnosis").map(r => rowToDxCandidate(r, key)).filter((x): x is DxCandidateRow => x !== null).sort((a, b) => a.RANK - b.RANK);
  const clusterScoringRules = byType("cluster_scoring").map(r => rowToClusterScoring(r, key)).filter((x): x is ClusterScoringRule => x !== null);
  const scoringDefs: ScoringDef[] = [];
  const outputTemplates: OutputTemplate[] = byType("plan").map(r => rowToOutputTemplate(r, key)).filter((x): x is OutputTemplate => x !== null);

  const globalMedicationsMaster      = byType("medication").map(r => rowToWorldBRow(r, "GLOBAL_MEDICATIONS_MASTER"));
  const urgentCareSpotInterventions  = byType("workup").map(r => rowToWorldBRow(r, "URGENT_CARE_SPOT_INTERVENTIONS"));
  const modifiers                    = byType("modifier").map(r => rowToWorldBRow(r, "MODIFIERS"));

  const totalRules = redFlagRules.length + coreQuestions.length + dispositionRules.length + dxCandidates.length;
  console.log(
    `[loadComplaintConfigFromDB] DB fallback: "${key}" — ` +
    `${redFlagRules.length} RF, ${coreQuestions.length} Q, ` +
    `${dispositionRules.length} DISP, ${dxCandidates.length} DX, ` +
    `${globalMedicationsMaster.length} meds, ${urgentCareSpotInterventions.length} workup`,
  );

  emitMetric("auralyn.context.config_fallback_used", 1, { complaint_id: key, total_rules: String(totalRules) });

  if (totalRules === 0) {
    console.warn(`[loadComplaintConfigFromDB] DB returned rules but none mapped for "${key}"`);
    return null;
  }

  return {
    registry:                  buildRegistry(key),
    coreQuestions,
    redFlagRules,
    scoringDefs,
    dispositionRules,
    outputTemplates,
    clusterScoringRules,
    dxCandidates,
    modifiers,
    scoringSystems:            [],
    globalSecondary:           [],
    globalClusterMaster:       [],
    clusterPrimaryDiagnosis:   [],
    redFlagsMaster:            redFlagRules.map(rf => ({
      __sourceTable:  "RED_FLAGS_MASTER",
      RF_ID:          rf.rfId,
      LABEL:          rf.label,
      TRIGGER_EXPR:   rf.triggerExpr,
      SEVERITY:       rf.severity,
      ACTION:         rf.action,
      RATIONALE:      rf.rationale,
    })),
    globalMedicationsMaster,
    urgentCareSpotInterventions,
    medConditionIntelligenceRules: [],
  };
}
