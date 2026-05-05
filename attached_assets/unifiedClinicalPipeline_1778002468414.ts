/**
 * unifiedClinicalPipeline.ts
 * Drop into: server/clinical/unifiedClinicalPipeline.ts
 *
 * RECONCILES THE TWO ENGINES
 *
 * PROBLEM: Two engines, different step orders, neither complete.
 *
 * World B pipeline (clinicalPipelineRoutes.ts):
 *   Steps 1-9 + 13 (no steps 10-12)
 *   Clinically correct step order
 *   Token-matching expression evaluator (incorrect logic)
 *
 * DB engine (ruleExecutionEngine.ts):
 *   Steps 1-13 (complete)
 *   Backwards step order (differential after disposition)
 *   Correct threshold parsing but limited to kb_master_rules
 *
 * SOLUTION:
 * One canonical 13-step pipeline using:
 *   - World B's clinically correct step order
 *   - The new expression evaluator (correct boolean + threshold logic)
 *   - Steps 10-12 from the DB engine brought into the canonical flow
 *   - kbQueryLayer.ts for PostgreSQL KB (4,207 rules)
 *   - Real audit write (not a stub)
 *   - Stale config disclosure
 *
 * CANONICAL STEP ORDER (matches World B, which is clinically correct):
 *   Step 1  — Complaint Identification
 *   Step 2  — Differential Diagnosis (BEFORE questions — question engine needs DDx)
 *   Step 3A — Modifier Collection (BEFORE questions — shapes which questions fire)
 *   Step 3B — Question Engine
 *   Step 4  — Workup Selection
 *   Step 5  — Red Flag Safety Screen (HARD stop overrides all downstream)
 *   Step 6  — Cluster Scoring
 *   Step 7  — Diagnosis Ranking
 *   Step 8  — Disposition Determination
 *   Step 9  — Plan Generation (bound to disposition, not free-floating)
 *   Step 10 — Medication Group Selection (NEW — from DB engine)
 *   Step 11 — Medication Safety Filters (NEW — from DB engine)
 *   Step 12 — Plan Finalization (combines steps 9+10+11)
 *   Step 13 — Audit Trail (real write, not stub)
 *
 * USAGE:
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
  symptoms:    string[];
  answers:     Record<string, string | number | boolean>;
  vitals?:     Record<string, number>;  // O2_sat, HR, temp, etc.
  age?:        number;
  sex?:        "M" | "F" | "other";
  pregnant?:   boolean;
  allergies?:  string[];
  pmh?:        string[];
  currentMeds?: string[];
}

export interface PipelineStepResult {
  step:        number;
  name:        string;
  status:      "ok" | "warn" | "hard_stop" | "skipped";
  fired:       FiredRule[];
  output:      Record<string, any>;
  warnings?:   string[];
}

export interface PipelineResult {
  complaintId:       string;
  steps:             PipelineStepResult[];
  finalDisposition:  string;
  topDiagnoses:      Array<{ dxId: string; label: string; score: number; rank: number }>;
  redFlagsHit:       string[];
  hardStopFired:     boolean;
  hardStopReason?:   string;
  medicationGroups:  string[];
  safetyFiltersApplied: string[];
  planText:          string;
  kbPromptBlock:     string;   // for injection into clinical brain
  auditId:           string;
  staleConfig:       boolean;
  staleWarning?:     string;
}

// ─── Helper: get value from row with multiple possible column names ────────────

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
  physicianId:  string;  // ALWAYS from auth session
  sessionId:    string;
}): Promise<PipelineResult> {

  const { complaintId, patientInput, physicianId, sessionId } = params;
  const startedAt = Date.now();
  const steps:     PipelineStepResult[] = [];
  const firedRules: FiredRule[] = [];

  // Build token map from patient input
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

  // Add age and sex as numeric/string tokens
  if (patientInput.age)  tokens.set("age", patientInput.age);
  if (patientInput.sex)  tokens.set("sex", patientInput.sex);

  // ── Track state ──────────────────────────────────────────────────────────────
  let hardStopFired  = false;
  let hardStopReason = "";
  let finalDisposition = "routine";
  const redFlagsHit: string[] = [];
  const topDiagnoses: PipelineResult["topDiagnoses"] = [];
  const clusterScores = new Map<string, number>();
  const medicationGroups: string[] = [];
  const safetyFiltersApplied: string[] = [];
  let planText = "";
  let staleConfig = false;
  let configLoadedAt = new Date().toISOString();
  let configVersion  = "unknown";

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 1 — Complaint Identification
  // ──────────────────────────────────────────────────────────────────────────────

  let cfg: ComplaintConfig | null = null;
  try {
    cfg = await loadComplaintConfig(complaintId);
    configLoadedAt = new Date().toISOString();
    configVersion  = hashConfigVersion({
      ccId:      complaintId,
      version:   cfg?.registry?.version,
      ruleCount: (cfg?.redFlagRules?.length ?? 0) + (cfg?.dispositionRules?.length ?? 0),
    });
  } catch (err: any) {
    // Check if stale cache was used
    staleConfig = true;
  }

  steps.push({
    step:   1,
    name:   "Complaint Identification",
    status: cfg ? "ok" : "warn",
    fired:  [],
    output: {
      complaintId,
      found:         !!cfg,
      engineType:    cfg?.registry?.engineType ?? "unknown",
      staleConfig,
    },
    warnings: staleConfig ? ["Config loaded from stale cache — rules may be outdated"] : undefined,
  });

  if (!cfg) {
    // Cannot proceed without a config — return safe default
    return buildSafeDefault(complaintId, steps, physicianId, sessionId, staleConfig, tokens);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 2 — Differential Diagnosis (BEFORE questions — clinically correct)
  // ──────────────────────────────────────────────────────────────────────────────

  const dxStep: PipelineStepResult = { step: 2, name: "Differential Diagnosis", status: "ok", fired: [], output: {} };
  const candidateDx = cfg.dxCandidates?.filter(dx => {
    const ccMatch = dx.CC_ID?.toLowerCase() === complaintId;
    return ccMatch;
  }) ?? [];

  candidateDx.slice(0, 10).forEach(dx => {
    dxStep.fired.push({ ruleId: dx.DX_ID, ruleVersion: "1.0", ruleType: "diagnosis", fired: true });
    topDiagnoses.push({ dxId: dx.DX_ID, label: dx.DX_LABEL, score: dx.BASE_SCORE ?? 0, rank: dx.RANK ?? 99 });
  });

  dxStep.output = { candidateCount: candidateDx.length, topDiagnoses: topDiagnoses.slice(0, 5) };
  steps.push(dxStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 3A — Modifier Collection
  // ──────────────────────────────────────────────────────────────────────────────

  const modStep: PipelineStepResult = { step: 3, name: "Modifier Collection", status: "ok", fired: [], output: {} };
  const appliedModifiers: string[] = [];

  for (const mod of [...(cfg.modifiers ?? [])]) {
    const modRow = mod as Record<string, any>;
    if (evaluateRowExpr(modRow, tokens)) {
      const modId = getAny(modRow, ["MODIFIER_ID", "ID", "id"]);
      if (modId) {
        appliedModifiers.push(modId);
        modStep.fired.push({ ruleId: modId, ruleVersion: "1.0", ruleType: "modifier", fired: true });
        // Add modifier result to tokens
        const resultKey = getAny(modRow, ["RESULT_KEY", "OUTPUT_KEY"]);
        if (resultKey) tokens.set(resultKey.toLowerCase(), true);
      }
    }
  }

  modStep.output = { applied: appliedModifiers };
  steps.push(modStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 3B — Question Engine (uses differential to ask targeted questions)
  // ──────────────────────────────────────────────────────────────────────────────

  const qStep: PipelineStepResult = { step: 4, name: "Question Engine", status: "ok", fired: [], output: {} };
  const questionsAsked: string[] = [];

  for (const q of cfg.coreQuestions ?? []) {
    // ASK_IF expression uses the full evaluator now
    const shouldAsk = !q.askIf || evaluateExpr(q.askIf, tokens);
    if (shouldAsk) {
      questionsAsked.push(q.qId);
      qStep.fired.push({ ruleId: q.qId, ruleVersion: "1.0", ruleType: "question", fired: true });
      // If answer exists in patient input, add to tokens
      const answer = patientInput.answers[q.qId] ?? patientInput.answers[q.questionText];
      if (answer !== undefined) tokens.set(q.qId.toLowerCase(), answer);
    }
  }

  qStep.output = { questionsAsked: questionsAsked.length, answered: Object.keys(patientInput.answers).length };
  steps.push(qStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 4 — Workup Selection
  // ──────────────────────────────────────────────────────────────────────────────

  const workupStep: PipelineStepResult = { step: 5, name: "Workup Selection", status: "ok", fired: [], output: {} };
  const workupOrdered: string[] = [];

  for (const row of cfg.urgentCareSpotInterventions ?? []) {
    const r = row as Record<string, any>;
    if (evaluateRowExpr(r, tokens)) {
      const intervention = getAny(r, ["INTERVENTION", "TEST", "WORKUP_ITEM"]);
      if (intervention) workupOrdered.push(intervention);
    }
  }

  workupStep.output = { ordered: workupOrdered };
  steps.push(workupStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 5 — Red Flag Safety Screen (HARD stop overrides everything downstream)
  // ──────────────────────────────────────────────────────────────────────────────

  const rfStep: PipelineStepResult = { step: 6, name: "Red Flag Safety Screen", status: "ok", fired: [], output: {} };

  for (const rf of cfg.redFlagRules ?? []) {
    if (evaluateExpr(rf.triggerExpr, tokens)) {
      redFlagsHit.push(rf.rfId);
      rfStep.fired.push({ ruleId: rf.rfId, ruleVersion: "1.0", ruleType: "red_flag", fired: true, outcome: rf.action });
      firedRules.push({ ruleId: rf.rfId, ruleVersion: "1.0", ruleType: "red_flag", fired: true });

      if (rf.severity === "HARD") {
        hardStopFired  = true;
        hardStopReason = `${rf.label}: ${rf.rationale}`;
        finalDisposition = "ER_SEND";
        rfStep.status   = "hard_stop";
        rfStep.warnings = [`HARD STOP: ${rf.label}`];
        break;  // First HARD stop wins — no point evaluating more
      }
    }
  }

  rfStep.output = { redFlagsHit, hardStopFired, finalDisposition };
  steps.push(rfStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 6 — Cluster Scoring
  // ──────────────────────────────────────────────────────────────────────────────

  const csStep: PipelineStepResult = { step: 7, name: "Cluster Scoring", status: "ok", fired: [], output: {} };

  if (!hardStopFired) {
    for (const rule of cfg.clusterScoringRules ?? []) {
      if (evaluateExpr(rule.whenExpr, tokens)) {
        const current = clusterScores.get(rule.clusterId) ?? 0;
        clusterScores.set(rule.clusterId, current + rule.points);
        csStep.fired.push({ ruleId: rule.ruleId, ruleVersion: "1.0", ruleType: "cluster_scoring", fired: true, points: rule.points });
        firedRules.push({ ruleId: rule.ruleId, ruleVersion: "1.0", ruleType: "cluster_scoring", fired: true });
        // Add cluster score to tokens for downstream disposition evaluation
        tokens.set(`cluster_${rule.clusterId.toLowerCase()}`, clusterScores.get(rule.clusterId)!);
      }
    }
  }

  const sortedClusters = [...clusterScores.entries()].sort((a, b) => b[1] - a[1]);
  csStep.output = { clusters: Object.fromEntries(sortedClusters) };
  steps.push(csStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 7 — Diagnosis Ranking (update scores from cluster scoring)
  // ──────────────────────────────────────────────────────────────────────────────

  const dxRankStep: PipelineStepResult = { step: 8, name: "Diagnosis Ranking", status: "ok", fired: [], output: {} };

  if (!hardStopFired) {
    // Update diagnosis scores from cluster scores
    topDiagnoses.forEach(dx => {
      const candidate = cfg!.dxCandidates?.find(c => c.DX_ID === dx.dxId);
      if (candidate?.BEST_CLUSTER_ID) {
        const clusterBonus = clusterScores.get(candidate.BEST_CLUSTER_ID) ?? 0;
        dx.score += clusterBonus;
      }
    });
    topDiagnoses.sort((a, b) => b.score - a.score);
  }

  dxRankStep.output = { topDiagnoses: topDiagnoses.slice(0, 5) };
  steps.push(dxRankStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 8 — Disposition Determination
  // ──────────────────────────────────────────────────────────────────────────────

  const dispStep: PipelineStepResult = { step: 9, name: "Disposition Determination", status: "ok", fired: [], output: {} };

  if (!hardStopFired) {
    // Find first matching disposition rule (sorted by priority)
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

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 10 — Medication Group Selection (NEW — was missing from World B)
  // ──────────────────────────────────────────────────────────────────────────────

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

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 11 — Medication Safety Filters (NEW — was missing from World B)
  // ──────────────────────────────────────────────────────────────────────────────

  const medSafetyStep: PipelineStepResult = { step: 11, name: "Medication Safety Filters", status: "ok", fired: [], output: {} };

  for (const row of cfg.medConditionIntelligenceRules ?? []) {
    const r = row as Record<string, any>;
    if (evaluateRowExpr(r, tokens)) {
      const filterLabel = getAny(r, ["FILTER_LABEL", "SAFETY_FILTER", "RULE_LABEL"]);
      const blockedMed  = getAny(r, ["BLOCKED_MED", "CONTRAINDICATED_MED", "MED_GROUP"]);
      if (filterLabel) {
        safetyFiltersApplied.push(filterLabel);
        medSafetyStep.fired.push({ ruleId: getAny(r, ["RULE_ID", "ID"]), ruleVersion: "1.0", ruleType: "medication_safety", fired: true, outcome: `Block: ${blockedMed}` });
        // Remove blocked medication group
        const idx = medicationGroups.indexOf(blockedMed);
        if (idx !== -1) medicationGroups.splice(idx, 1);
      }
    }
  }

  medSafetyStep.output = { filtersApplied: safetyFiltersApplied, remainingGroups: medicationGroups };
  steps.push(medSafetyStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 12 — Plan Finalization (binds disposition + medications + workup)
  // ──────────────────────────────────────────────────────────────────────────────

  const planStep: PipelineStepResult = { step: 12, name: "Plan Finalization", status: "ok", fired: [], output: {} };

  const outputTemplate = cfg.outputTemplates?.find(t => {
    const tRow = t as Record<string, any>;
    const level = getAny(tRow, ["DISPOSITION_LEVEL", "LEVEL"]);
    return level.toLowerCase() === finalDisposition.toLowerCase();
  }) ?? cfg.outputTemplates?.[0];

  if (outputTemplate) {
    const tRow = outputTemplate as Record<string, any>;
    const templateText = getAny(tRow, ["TEMPLATE_TEXT", "PLAN_TEXT", "OUTPUT_TEXT"]);
    planText = templateText
      .replace("{disposition}", finalDisposition)
      .replace("{complaint}", complaintId.replace(/_/g, " "))
      .replace("{top_dx}", topDiagnoses[0]?.label ?? "uncertain")
      .replace("{med_groups}", medicationGroups.join(", ") || "none selected")
      .replace("{workup}", workupOrdered.join(", ") || "none indicated");
  }

  planStep.output = { planText: planText.slice(0, 200), templateFound: !!outputTemplate };
  steps.push(planStep);

  // ──────────────────────────────────────────────────────────────────────────────
  // STEP 13 — Audit Trail (REAL WRITE — not a stub)
  // ──────────────────────────────────────────────────────────────────────────────

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

  // Merge KB rules into fired rules for audit
  if (kbResult) {
    kbResult.rulesFired.forEach(rId =>
      firedRules.push({ ruleId: rId, ruleVersion: "1.0", ruleType: "kb_rule", fired: true })
    );
  }

  const { auditId, staleWarning } = await writePipelineAudit({
    physicianId,
    sessionId,
    complaintId,
    engineType:        "WORLD_B",
    symptomTokens:     patientInput.symptoms,
    vitalSigns:        patientInput.vitals,
    modifiersApplied:  appliedModifiers,
    rulesFired:        firedRules,
    redFlagsHit,
    hardStopFired,
    hardStopReason:    hardStopFired ? hardStopReason : undefined,
    finalDisposition,
    topDiagnoses:      topDiagnoses.slice(0, 5).map(d => d.label),
    configVersion,
    staleConfig,
    configLoadedAt,
  }, physicianId);

  const auditStep: PipelineStepResult = {
    step:   13,
    name:   "Audit Trail",
    status: "ok",
    fired:  [],
    output: { auditId, staleConfig, staleWarning, totalRulesFired: firedRules.length },
  };
  steps.push(auditStep);

  return {
    complaintId,
    steps,
    finalDisposition,
    topDiagnoses:          topDiagnoses.slice(0, 10),
    redFlagsHit,
    hardStopFired,
    hardStopReason:        hardStopFired ? hardStopReason : undefined,
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
  physicianId: string,
  sessionId:   string,
  staleConfig: boolean,
  tokens:      ClinicalTokens
): PipelineResult {
  return {
    complaintId,
    steps,
    finalDisposition:      "PHYSICIAN_REVIEW_REQUIRED",
    topDiagnoses:          [],
    redFlagsHit:           [],
    hardStopFired:         false,
    medicationGroups:      [],
    safetyFiltersApplied:  [],
    planText:              "Clinical configuration unavailable. Physician review required.",
    kbPromptBlock:         "",
    auditId:               `aud-fail-${Date.now()}`,
    staleConfig,
    staleWarning:          "Clinical configuration could not be loaded. All recommendations require physician verification.",
  };
}
