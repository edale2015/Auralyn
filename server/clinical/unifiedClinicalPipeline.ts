/**
 * unifiedClinicalPipeline.ts
 *
 * RECONCILES THE TWO ENGINES
 *
 * Previous state:
 *   World B pipeline (clinicalPipelineRoutes.ts)   — Steps 1-9+13, correct clinical order, token-matching (broken logic)
 *   DB engine (ruleExecutionEngine.ts)             — Steps 1-13, backwards step order, threshold parsing, no Steps 10-12 in World B
 *
 * This module provides ONE canonical 13-step pipeline using:
 *   - World B's clinically correct step order
 *   - The new clinicalExprEvaluator (correct boolean + threshold logic)
 *   - Steps 10-12 (Medication Group, Medication Safety, Plan Finalization) from DB engine
 *   - kbQueryLayer for PostgreSQL KB retrieval
 *   - Real audit write via pipelineAuditWriter (not a stub)
 *   - Stale config disclosure
 *
 * CANONICAL STEP ORDER:
 *   Step 1  — Complaint Identification
 *   Step 2  — Differential Diagnosis          (BEFORE questions — question engine needs DDx context)
 *   Step 3  — Modifier Collection             (BEFORE questions — shapes which questions fire)
 *   Step 4  — Question Engine
 *   Step 5  — Workup Selection
 *   Step 6  — Red Flag Safety Screen          (HARD stop overrides all downstream)
 *   Step 7  — Cluster Scoring
 *   Step 8  — Diagnosis Ranking
 *   Step 9  — Disposition Determination
 *   Step 10 — Medication Group Selection      (previously absent from World B)
 *   Step 11 — Medication Safety Filters       (previously absent from World B)
 *   Step 12 — Plan Finalization               (binds disposition + meds + workup)
 *   Step 13 — Audit Trail                     (real write, not stub)
 *
 * Usage:
 *   import { runClinicalPipeline } from "./unifiedClinicalPipeline";
 *   const result = await runClinicalPipeline({ complaintId, patientInput, physicianId, sessionId });
 */

import { evaluateExpr, evaluateRowExpr, buildClinicalTokens, type ClinicalTokens }
  from "./clinicalExprEvaluator";
import { writePipelineAudit, hashConfigVersion, type FiredRule }
  from "./pipelineAuditWriter";
import { queryKBCached, buildKBPromptBlock, type PatientContext }
  from "../retrieval/kbQueryLayer";
import { loadComplaintConfig, type ComplaintConfig }
  from "../services/complaintConfigLoader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientInput {
  symptoms:     string[];
  answers:      Record<string, string | number | boolean>;
  vitals?:      Record<string, number>;
  age?:         number;
  sex?:         "M" | "F" | "other";
  pregnant?:    boolean;
  allergies?:   string[];
  pmh?:         string[];
  currentMeds?: string[];
}

export interface PipelineStepResult {
  step:      number;
  name:      string;
  status:    "ok" | "warn" | "hard_stop" | "skipped";
  fired:     FiredRule[];
  output:    Record<string, any>;
  warnings?: string[];
}

export interface PipelineResult {
  complaintId:          string;
  steps:                PipelineStepResult[];
  finalDisposition:     string;
  topDiagnoses:         Array<{ dxId: string; label: string; score: number; rank: number }>;
  redFlagsHit:          string[];
  hardStopFired:        boolean;
  hardStopReason?:      string;
  medicationGroups:     string[];
  safetyFiltersApplied: string[];
  planText:             string;
  kbPromptBlock:        string;
  auditId:              string;
  staleConfig:          boolean;
  staleWarning?:        string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function getAny(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runClinicalPipeline(params: {
  complaintId:  string;
  patientInput: PatientInput;
  physicianId:  string;
  sessionId:    string;
}): Promise<PipelineResult> {
  const { complaintId, patientInput, physicianId, sessionId } = params;
  const steps:      PipelineStepResult[] = [];
  const firedRules: FiredRule[]          = [];

  const tokens: ClinicalTokens = buildClinicalTokens({
    symptoms:  patientInput.symptoms,
    answers:   patientInput.answers,
    vitals:    patientInput.vitals,
    modifiers: {
      pregnant:          patientInput.pregnant ?? false,
      diabetic:          patientInput.pmh?.some(h => /diabet/i.test(h)) ?? false,
      chf:               patientInput.pmh?.some(h => /heart failure|chf/i.test(h)) ?? false,
      copd:              patientInput.pmh?.some(h => /copd|emphysema/i.test(h)) ?? false,
      immunocompromised: patientInput.pmh?.some(h => /immunocompromised|hiv|transplant/i.test(h)) ?? false,
      anticoagulated:    patientInput.currentMeds?.some(m => /warfarin|eliquis|xarelto|coumadin/i.test(m)) ?? false,
    },
  });

  if (patientInput.age)  tokens.set("age", patientInput.age);
  if (patientInput.sex)  tokens.set("sex", patientInput.sex);

  let hardStopFired    = false;
  let hardStopReason   = "";
  let finalDisposition = "routine";
  const redFlagsHit:           string[] = [];
  const topDiagnoses:          PipelineResult["topDiagnoses"] = [];
  const clusterScores          = new Map<string, number>();
  const medicationGroups:      string[] = [];
  const safetyFiltersApplied:  string[] = [];
  let planText                 = "";
  let staleConfig              = false;
  let configLoadedAt           = new Date().toISOString();
  let configVersion            = "unknown";

  // ── Step 1: Complaint Identification ────────────────────────────────────────

  let cfg: ComplaintConfig | null = null;
  try {
    cfg = await loadComplaintConfig(complaintId);
    configLoadedAt = new Date().toISOString();
    configVersion  = hashConfigVersion({
      ccId:      complaintId,
      version:   cfg?.registry?.version,
      ruleCount: (cfg?.redFlagRules?.length ?? 0) + (cfg?.dispositionRules?.length ?? 0),
    });
  } catch {
    staleConfig = true;
  }

  steps.push({
    step:   1,
    name:   "Complaint Identification",
    status: cfg ? "ok" : "warn",
    fired:  [],
    output: { complaintId, found: !!cfg, engineType: cfg?.registry?.engineType ?? "unknown", staleConfig },
    warnings: staleConfig ? ["Config loaded from stale cache — rules may be outdated"] : undefined,
  });

  if (!cfg) return buildSafeDefault(complaintId, steps, staleConfig);

  // ── Step 2: Differential Diagnosis ──────────────────────────────────────────

  const dxStep: PipelineStepResult = { step: 2, name: "Differential Diagnosis", status: "ok", fired: [], output: {} };
  const candidateDx = cfg.dxCandidates?.filter(dx => dx.CC_ID?.toLowerCase() === complaintId) ?? [];

  candidateDx.slice(0, 10).forEach(dx => {
    dxStep.fired.push({ ruleId: dx.DX_ID, ruleVersion: "1.0", ruleType: "diagnosis", fired: true });
    topDiagnoses.push({ dxId: dx.DX_ID, label: dx.DX_LABEL, score: dx.BASE_SCORE ?? 0, rank: dx.RANK ?? 99 });
  });

  dxStep.output = { candidateCount: candidateDx.length, topDiagnoses: topDiagnoses.slice(0, 5) };
  steps.push(dxStep);

  // ── Step 3: Modifier Collection ─────────────────────────────────────────────

  const modStep: PipelineStepResult = { step: 3, name: "Modifier Collection", status: "ok", fired: [], output: {} };
  const appliedModifiers: string[]  = [];

  for (const mod of cfg.modifiers ?? []) {
    const modRow = mod as Record<string, any>;
    if (evaluateRowExpr(modRow, tokens)) {
      const modId = getAny(modRow, ["MODIFIER_ID", "ID", "id"]);
      if (modId) {
        appliedModifiers.push(modId);
        modStep.fired.push({ ruleId: modId, ruleVersion: "1.0", ruleType: "modifier", fired: true });
        const resultKey = getAny(modRow, ["RESULT_KEY", "OUTPUT_KEY"]);
        if (resultKey) tokens.set(resultKey.toLowerCase(), true);
      }
    }
  }

  modStep.output = { applied: appliedModifiers };
  steps.push(modStep);

  // ── Step 4: Question Engine ──────────────────────────────────────────────────

  const qStep: PipelineStepResult = { step: 4, name: "Question Engine", status: "ok", fired: [], output: {} };
  const questionsAsked: string[]  = [];

  for (const q of cfg.coreQuestions ?? []) {
    const shouldAsk = !q.askIf || evaluateExpr(q.askIf, tokens);
    if (shouldAsk) {
      questionsAsked.push(q.qId);
      qStep.fired.push({ ruleId: q.qId, ruleVersion: "1.0", ruleType: "question", fired: true });
      const answer = patientInput.answers[q.qId] ?? patientInput.answers[q.questionText];
      if (answer !== undefined) tokens.set(q.qId.toLowerCase(), answer);
    }
  }

  qStep.output = { questionsAsked: questionsAsked.length, answered: Object.keys(patientInput.answers).length };
  steps.push(qStep);

  // ── Step 5: Workup Selection ─────────────────────────────────────────────────

  const workupStep: PipelineStepResult = { step: 5, name: "Workup Selection", status: "ok", fired: [], output: {} };
  const workupOrdered: string[]        = [];

  for (const row of cfg.urgentCareSpotInterventions ?? []) {
    const r = row as Record<string, any>;
    if (evaluateRowExpr(r, tokens)) {
      const item = getAny(r, ["INTERVENTION", "TEST", "WORKUP_ITEM"]);
      if (item) workupOrdered.push(item);
    }
  }

  workupStep.output = { ordered: workupOrdered };
  steps.push(workupStep);

  // ── Step 6: Red Flag Safety Screen ──────────────────────────────────────────

  const rfStep: PipelineStepResult = { step: 6, name: "Red Flag Safety Screen", status: "ok", fired: [], output: {} };

  for (const rf of cfg.redFlagRules ?? []) {
    if (evaluateExpr(rf.triggerExpr, tokens)) {
      redFlagsHit.push(rf.rfId);
      rfStep.fired.push({ ruleId: rf.rfId, ruleVersion: "1.0", ruleType: "red_flag", fired: true, outcome: rf.action });
      firedRules.push({ ruleId: rf.rfId, ruleVersion: "1.0", ruleType: "red_flag", fired: true });

      if (rf.severity === "HARD") {
        hardStopFired    = true;
        hardStopReason   = `${rf.label}: ${rf.rationale}`;
        finalDisposition = "ER_SEND";
        rfStep.status    = "hard_stop";
        rfStep.warnings  = [`HARD STOP: ${rf.label}`];
        break;
      }
    }
  }

  rfStep.output = { redFlagsHit, hardStopFired, finalDisposition };
  steps.push(rfStep);

  // ── Step 7: Cluster Scoring ──────────────────────────────────────────────────

  const csStep: PipelineStepResult = { step: 7, name: "Cluster Scoring", status: "ok", fired: [], output: {} };

  if (!hardStopFired) {
    for (const rule of cfg.clusterScoringRules ?? []) {
      if (evaluateExpr(rule.whenExpr, tokens)) {
        const current = clusterScores.get(rule.clusterId) ?? 0;
        clusterScores.set(rule.clusterId, current + rule.points);
        csStep.fired.push({ ruleId: rule.ruleId, ruleVersion: "1.0", ruleType: "cluster_scoring", fired: true, points: rule.points });
        firedRules.push({ ruleId: rule.ruleId, ruleVersion: "1.0", ruleType: "cluster_scoring", fired: true });
        tokens.set(`cluster_${rule.clusterId.toLowerCase()}`, clusterScores.get(rule.clusterId)!);
      }
    }
  }

  const sortedClusters = [...clusterScores.entries()].sort((a, b) => b[1] - a[1]);
  csStep.output = { clusters: Object.fromEntries(sortedClusters) };
  steps.push(csStep);

  // ── Step 8: Diagnosis Ranking ────────────────────────────────────────────────

  const dxRankStep: PipelineStepResult = { step: 8, name: "Diagnosis Ranking", status: "ok", fired: [], output: {} };

  if (!hardStopFired) {
    topDiagnoses.forEach(dx => {
      const candidate = cfg!.dxCandidates?.find(c => c.DX_ID === dx.dxId);
      if (candidate?.BEST_CLUSTER_ID) {
        dx.score += clusterScores.get(candidate.BEST_CLUSTER_ID) ?? 0;
      }
    });
    topDiagnoses.sort((a, b) => b.score - a.score);
  }

  dxRankStep.output = { topDiagnoses: topDiagnoses.slice(0, 5) };
  steps.push(dxRankStep);

  // ── Step 9: Disposition Determination ───────────────────────────────────────

  const dispStep: PipelineStepResult = { step: 9, name: "Disposition Determination", status: "ok", fired: [], output: {} };

  if (!hardStopFired) {
    const matchingDisp = cfg.dispositionRules?.find(r => evaluateExpr(r.whenExpr, tokens))
      ?? cfg.dispositionRules?.find(r => ["true", "always", "default"].includes((r.whenExpr ?? "").toLowerCase()))
      ?? cfg.dispositionRules?.[0];

    if (matchingDisp) {
      finalDisposition = matchingDisp.dispositionLevel;
      dispStep.fired.push({ ruleId: matchingDisp.dispRuleId, ruleVersion: "1.0", ruleType: "disposition", fired: true });
      firedRules.push({ ruleId: matchingDisp.dispRuleId, ruleVersion: "1.0", ruleType: "disposition", fired: true });
    }
  }

  dispStep.output = { finalDisposition, hardStopOverride: hardStopFired };
  steps.push(dispStep);

  // ── Step 10: Medication Group Selection ─────────────────────────────────────

  const medStep: PipelineStepResult = { step: 10, name: "Medication Group Selection", status: "ok", fired: [], output: {} };

  if (!hardStopFired || finalDisposition !== "ER_SEND") {
    for (const row of cfg.globalMedicationsMaster ?? []) {
      const r = row as Record<string, any>;
      if (evaluateRowExpr(r, tokens)) {
        const medGroup = getAny(r, ["MED_GROUP", "MEDICATION_GROUP", "GROUP_ID"]);
        if (medGroup && !medicationGroups.includes(medGroup)) {
          medicationGroups.push(medGroup);
          medStep.fired.push({ ruleId: medGroup, ruleVersion: "1.0", ruleType: "medication", fired: true });
        }
      }
    }
  }

  medStep.output = { medicationGroups };
  steps.push(medStep);

  // ── Step 11: Medication Safety Filters ──────────────────────────────────────

  const medSafetyStep: PipelineStepResult = { step: 11, name: "Medication Safety Filters", status: "ok", fired: [], output: {} };

  for (const row of cfg.medConditionIntelligenceRules ?? []) {
    const r = row as Record<string, any>;
    if (evaluateRowExpr(r, tokens)) {
      const filterLabel = getAny(r, ["FILTER_LABEL", "SAFETY_FILTER", "RULE_LABEL"]);
      const blockedMed  = getAny(r, ["BLOCKED_MED", "CONTRAINDICATED_MED", "MED_GROUP"]);
      if (filterLabel) {
        safetyFiltersApplied.push(filterLabel);
        medSafetyStep.fired.push({ ruleId: getAny(r, ["RULE_ID", "ID"]), ruleVersion: "1.0", ruleType: "medication_safety", fired: true, outcome: `Block: ${blockedMed}` });
        const idx = medicationGroups.indexOf(blockedMed);
        if (idx !== -1) medicationGroups.splice(idx, 1);
      }
    }
  }

  medSafetyStep.output = { filtersApplied: safetyFiltersApplied, remainingGroups: medicationGroups };
  steps.push(medSafetyStep);

  // ── Step 12: Plan Finalization ───────────────────────────────────────────────

  const planStep: PipelineStepResult = { step: 12, name: "Plan Finalization", status: "ok", fired: [], output: {} };

  const outputTemplate = cfg.outputTemplates?.find(t => {
    const tRow = t as Record<string, any>;
    const level = getAny(tRow, ["DISPOSITION_LEVEL", "LEVEL"]);
    return level.toLowerCase() === finalDisposition.toLowerCase();
  }) ?? cfg.outputTemplates?.[0];

  if (outputTemplate) {
    const tRow       = outputTemplate as Record<string, any>;
    const tmplText   = getAny(tRow, ["TEMPLATE_TEXT", "PLAN_TEXT", "OUTPUT_TEXT", "body", "BODY"]);
    planText = tmplText
      .replace("{disposition}", finalDisposition)
      .replace("{complaint}",   complaintId.replace(/_/g, " "))
      .replace("{top_dx}",      topDiagnoses[0]?.label ?? "uncertain")
      .replace("{med_groups}",  medicationGroups.join(", ") || "none selected")
      .replace("{workup}",      workupOrdered.join(", ") || "none indicated");
  }

  planStep.output = { planText: planText.slice(0, 500), templateFound: !!outputTemplate };
  steps.push(planStep);

  // ── Step 13: Audit Trail (real write) ───────────────────────────────────────

  const kbResult = await queryKBCached(complaintId, {
    age:               patientInput.age,
    pregnant:          patientInput.pregnant,
    allergies:         patientInput.allergies,
    currentMeds:       patientInput.currentMeds,
    diabetic:          patientInput.pmh?.some(h => /diabet/i.test(h)),
    chf:               patientInput.pmh?.some(h => /heart failure|chf/i.test(h)),
    copd:              patientInput.pmh?.some(h => /copd/i.test(h)),
    immunocompromised: patientInput.pmh?.some(h => /immunocompromised|hiv/i.test(h)),
    renalDisease:      patientInput.pmh?.some(h => /renal|kidney|ckd/i.test(h)),
    anticoagulated:    patientInput.currentMeds?.some(m => /warfarin|eliquis|xarelto/i.test(m)),
  } as PatientContext).catch(() => null);

  const kbPromptBlock = kbResult ? buildKBPromptBlock(kbResult) : "";
  if (kbResult) {
    kbResult.rulesFired.forEach(rId =>
      firedRules.push({ ruleId: rId, ruleVersion: "1.0", ruleType: "kb_rule", fired: true })
    );
  }

  const { auditId, staleWarning } = await writePipelineAudit({
    physicianId,
    sessionId,
    complaintId,
    engineType:       "WORLD_B",
    symptomTokens:    patientInput.symptoms,
    vitalSigns:       patientInput.vitals,
    modifiersApplied: appliedModifiers,
    rulesFired:       firedRules,
    redFlagsHit,
    hardStopFired,
    hardStopReason:   hardStopFired ? hardStopReason : undefined,
    finalDisposition,
    topDiagnoses:     topDiagnoses.slice(0, 5).map(d => d.label),
    configVersion,
    staleConfig,
    configLoadedAt,
  }, physicianId);

  steps.push({
    step:   13,
    name:   "Audit Trail",
    status: "ok",
    fired:  [],
    output: { auditId, staleConfig, staleWarning, totalRulesFired: firedRules.length },
    warnings: staleWarning ? [staleWarning] : undefined,
  });

  return {
    complaintId,
    steps,
    finalDisposition,
    topDiagnoses:         topDiagnoses.slice(0, 10),
    redFlagsHit,
    hardStopFired,
    hardStopReason:       hardStopFired ? hardStopReason : undefined,
    medicationGroups,
    safetyFiltersApplied,
    planText,
    kbPromptBlock,
    auditId,
    staleConfig,
    staleWarning,
  };
}

// ─── Safe default when config cannot load ────────────────────────────────────

function buildSafeDefault(
  complaintId: string,
  steps:       PipelineStepResult[],
  staleConfig: boolean
): PipelineResult {
  return {
    complaintId,
    steps,
    finalDisposition:     "PHYSICIAN_REVIEW_REQUIRED",
    topDiagnoses:         [],
    redFlagsHit:          [],
    hardStopFired:        false,
    medicationGroups:     [],
    safetyFiltersApplied: [],
    planText:             "Clinical configuration unavailable. Physician review required.",
    kbPromptBlock:        "",
    auditId:              `aud-fail-${Date.now()}`,
    staleConfig,
    staleWarning:         "Clinical configuration could not be loaded. All recommendations require physician verification.",
  };
}
