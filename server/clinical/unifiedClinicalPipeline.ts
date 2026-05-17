/**
 * unifiedClinicalPipeline.ts
 *
 * ONE canonical 13-step pipeline using:
 *   - World B's clinically correct step order
 *   - The new clinicalExprEvaluator (correct boolean + threshold logic)
 *   - Steps 10-12 (Medication Group, Medication Safety, Plan Finalization) from DB engine
 *   - kbQueryLayer for PostgreSQL KB retrieval
 *   - Real audit write via pipelineAuditWriter
 *   - Stale config disclosure
 *
 * T016 — Full artifact publication matrix: every step publishes typed artifacts to the bus.
 * T017 — Compaction check (via runCompactionCheck helper) runs before EVERY step.
 * T018 — bus.readFor(role) called before every step; consumption logged per step.
 * T022 — Supervisor gate between steps 11 and 12 (three exits: APPROVE / ADD_CONSTRAINT / OVERRIDE).
 *
 * CANONICAL STEP ORDER:
 *   Step 1  — Complaint Identification
 *   Step 2  — Differential Diagnosis
 *   Step 3  — Modifier Collection
 *   Step 4  — Question Engine
 *   Step 5  — Workup Selection
 *   Step 6  — Red Flag Safety Screen
 *   Step 7  — Cluster Scoring
 *   Step 8  — Diagnosis Ranking
 *   Step 9  — Disposition Determination
 *   Step 10 — Medication Group Selection
 *   Step 11 — Medication Safety Filters
 *   [Supervisor Gate — T022]
 *   Step 12 — Plan Finalization
 *   Step 13 — Audit Trail
 */

import { evaluateExpr, evaluateRowExpr, buildClinicalTokens, type ClinicalTokens }
  from "./clinicalExprEvaluator";
import { writePipelineAudit, hashConfigVersion, type FiredRule }
  from "./pipelineAuditWriter";
import { queryKBCached, buildKBPromptBlock, type PatientContext }
  from "../retrieval/kbQueryLayer";
import { loadComplaintConfig, type ComplaintConfig }
  from "../services/complaintConfigLoader";
import { ClinicalContextManager, estimateTokens } from "../context/ClinicalContextManager";
import { AgentArtifactBus } from "../context/AgentArtifactBus";
import { ContextCompactor } from "../context/ContextCompactor";
import { buildDefaultRegistry } from "../context/RoleScopedToolRegistry";
import type { AgentRole, EncounterContext, Artifact } from "../context/types";
import { storeEncounterContext, appendCompactionEvent } from "../routes/contextInspector.routes";
import { emitCompactionEvent as telemetryCompaction } from "../context/telemetry";
import { writeSupervisorHardConstraint } from "../context/memoryWriters";

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
  encounterContext?:    EncounterContext;
}

let _toolRegistryLogged = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAny(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * T017 — Run compaction check before every agent step.
 * T018 — Sync bus → ctx manager; call bus.readFor(role) and log consumption.
 */
function runCompactionCheck(params: {
  step:      number;
  role:      AgentRole;
  ctxMgr:    ClinicalContextManager;
  bus:       AgentArtifactBus;
  compactor: ContextCompactor;
  sessionId: string;
}): void {
  const { step, role, ctxMgr, bus, compactor, sessionId } = params;

  // T018 — sync all bus artifacts into context manager (idempotent)
  for (const a of bus.all()) ctxMgr.recordArtifact(a);

  // Update token estimate
  const ctx = ctxMgr.getContext();
  const newTokens = estimateTokens(JSON.stringify(ctx.working));
  ctxMgr.updateWorking({
    step,
    currentAgent:    role,
    estimatedTokens: Math.max(ctx.working.estimatedTokens, newTokens),
  });

  // T017 — compaction check
  if (compactor.shouldCompact(ctxMgr.getContext())) {
    const cResult = compactor.compact(ctxMgr.getContext());
    if (cResult.compacted) {
      ctxMgr.updateWorking(cResult.newWorking);
      for (const a of cResult.newArtifacts) ctxMgr.recordArtifact(a);
      appendCompactionEvent(sessionId, {
        sessionId,
        step,
        beforeTokens:     cResult.beforeTokens,
        afterTokens:      cResult.afterTokens,
        artifactsEmitted: cResult.newArtifacts.length,
        occurredAt:       new Date().toISOString(),
      });
      telemetryCompaction(step, sessionId);
      console.log(
        `[compactor] step=${step} before=${cResult.beforeTokens} ` +
        `after=${cResult.afterTokens} emitted=${cResult.newArtifacts.length}`,
      );
    }
  }

  // T018 — read from bus and log consumption
  const consumed = bus.readFor(role);
  console.log(`[${role}] consumed_artifacts=${consumed.length}`);
}

/**
 * Safe publish: bus.publish + ctxMgr.recordArtifact.
 * Throws ContractViolation on real violations (do not catch — surface them).
 * Silently ignores duplicate IDs (idempotent).
 */
function safePub(
  bus:    AgentArtifactBus,
  ctxMgr: ClinicalContextManager,
  role:   AgentRole,
  art:    Artifact,
): void {
  bus.publish(role, art);
  ctxMgr.recordArtifact(art);
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
  const nowIso = () => new Date().toISOString();

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
  let configLoadedAt           = nowIso();

  // ── Context Engineering Layer (T006–T018) ────────────────────────────────────
  const _encCtx: EncounterContext = {
    immutables: {
      encounterId:        sessionId,
      tenantId:           (patientInput as any).tenantId ?? "default",
      physicianId:        physicianId,
      patient: {
        ageYears:           patientInput.age ?? 0,
        sex:                (patientInput.sex as "M" | "F" | "Other") ?? "Other",
        allergies:          patientInput.allergies ?? [],
        currentMedications: patientInput.currentMeds ?? [],
        relevantHistory:    patientInput.pmh ?? [],
        pregnancyStatus:    patientInput.pregnant ? "pregnant" : "n/a",
      },
      chiefComplaint:       complaintId.replace(/_/g, " "),
      presentingVitals:     patientInput.vitals
        ? { ...patientInput.vitals as any, capturedAt: nowIso() }
        : undefined,
      redFlagsIdentified:   [],
      hardConstraints:      [],
      encounterStartedAt:   nowIso(),
    },
    working: {
      currentDifferential:   [],
      pendingQuestions:      [],
      answeredQuestions:     [],
      candidateDispositions: [],
      currentAgent:          "triage",
      step:                  0,
      estimatedTokens:       0,
    },
    artifacts: [],
    traceRefId: `s3://auralyn-audit/${new Date().toISOString().slice(0,10)}/${sessionId}/trace.jsonl`,
  };

  const _ctxMgr    = new ClinicalContextManager(_encCtx);
  const _bus       = new AgentArtifactBus(sessionId);
  const _compactor = new ContextCompactor();

  // T011 — Log action-space sizes once at startup
  if (!_toolRegistryLogged) {
    const _reg = buildDefaultRegistry();
    console.log("[context-engineering] action space sizes:", _reg.actionSpaceSizes());
    _toolRegistryLogged = true;
  }
  let configVersion = "unknown";

  // ── Step 1: Complaint Identification ────────────────────────────────────────
  runCompactionCheck({ step: 1, role: "triage", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

  let cfg: ComplaintConfig | null = null;
  try {
    cfg = await loadComplaintConfig(complaintId);
    configLoadedAt = nowIso();
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

  // T016 — Step 1: publish intake fields as validated_finding artifacts
  const step1Arts: Array<{ finding: string; src: string }> = [
    { finding: `Chief complaint: ${complaintId.replace(/_/g, " ")}`, src: "history" },
  ];
  if (patientInput.vitals && Object.keys(patientInput.vitals).length) {
    step1Arts.push({
      finding: `Vitals: ${Object.entries(patientInput.vitals).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      src: "vitals",
    });
  }
  if (patientInput.allergies?.length) {
    step1Arts.push({ finding: `Allergies: ${patientInput.allergies.join(", ")}`, src: "history" });
  }
  if (patientInput.currentMeds?.length) {
    step1Arts.push({ finding: `Current meds: ${patientInput.currentMeds.join(", ")}`, src: "history" });
  }
  if (patientInput.pmh?.length) {
    step1Arts.push({ finding: `PMH: ${patientInput.pmh.join("; ")}`, src: "history" });
  }

  step1Arts.forEach((a, i) => {
    safePub(_bus, _ctxMgr, "triage", {
      id:          `art_intake_${sessionId}_s1_${i}`,
      type:        "validated_finding",
      producedBy:  "triage",
      producedAt:  nowIso(),
      consumedBy:  [],
      payload:     { finding: a.finding, positiveOrNegative: "present", source: a.src as any },
      provenance:  { source: "patient", citation: "pipeline:step1:intake" },
      estimatedTokens: estimateTokens(a.finding) + 20,
    });
  });

  // ── Step 2: Differential Diagnosis ──────────────────────────────────────────
  runCompactionCheck({ step: 2, role: "differential", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

  const dxStep: PipelineStepResult = { step: 2, name: "Differential Diagnosis", status: "ok", fired: [], output: {} };
  const candidateDx = cfg.dxCandidates?.filter(dx => dx.CC_ID?.toLowerCase() === complaintId) ?? [];

  candidateDx.slice(0, 10).forEach(dx => {
    dxStep.fired.push({ ruleId: dx.DX_ID, ruleVersion: "1.0", ruleType: "diagnosis", fired: true });
    topDiagnoses.push({ dxId: dx.DX_ID, label: dx.DX_LABEL, score: dx.BASE_SCORE ?? 0, rank: dx.RANK ?? 99 });
    // Register in working differential
    _ctxMgr.upsertDifferentialItem({
      diagnosis:         dx.DX_LABEL,
      likelihood:        Math.min(0.95, Math.max(0.05, (dx.BASE_SCORE ?? 50) / 100)),
      supportingFindings: [],
      refutingFindings:  [],
      evidenceQuality:   "low",
      lastUpdatedStep:   2,
    });
  });

  // T016 — publish low-score dx as ruled_out immediately
  candidateDx.filter(dx => (dx.BASE_SCORE ?? 50) < 5).slice(0, 3).forEach((dx, i) => {
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_ruleout_init_${sessionId}_s2_${i}`,
      type:       "ruled_out",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        diagnosis:    dx.DX_LABEL,
        reason:       `Base score ${dx.BASE_SCORE ?? 0} below threshold at initial differential`,
        evidence:     [],
        reconsiderIf: ["new distinguishing finding emerges"],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step2:initial_differential" },
      estimatedTokens: 35,
    });
  });

  dxStep.output = { candidateCount: candidateDx.length, topDiagnoses: topDiagnoses.slice(0, 5) };
  steps.push(dxStep);

  // ── Step 3: Modifier Collection ─────────────────────────────────────────────
  runCompactionCheck({ step: 3, role: "triage", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 3: publish acuity classification + each modifier
  const acuityLevel = hardStopFired ? "critical" : (redFlagsHit.length > 0 ? "high" : "moderate");
  safePub(_bus, _ctxMgr, "triage", {
    id:         `art_acuity_${sessionId}_s3`,
    type:       "validated_finding",
    producedBy: "triage",
    producedAt: nowIso(),
    consumedBy: [],
    payload:    { finding: `Acuity classification: ${acuityLevel}`, positiveOrNegative: "present", source: "history" },
    provenance: { source: "rule_engine", citation: "pipeline:step3:acuity" },
    estimatedTokens: 25,
  });

  appliedModifiers.slice(0, 5).forEach((modId, i) => {
    safePub(_bus, _ctxMgr, "triage", {
      id:         `art_modifier_${sessionId}_s3_${i}`,
      type:       "validated_finding",
      producedBy: "triage",
      producedAt: nowIso(),
      consumedBy: [],
      payload:    { finding: `Modifier active: ${modId}`, positiveOrNegative: "present", source: "history" },
      provenance: { source: "patient", citation: `pipeline:step3:modifier:${modId}` },
      estimatedTokens: 20,
    });
  });

  // ── Step 4: Question Engine ──────────────────────────────────────────────────
  runCompactionCheck({ step: 4, role: "differential", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

  const qStep: PipelineStepResult = { step: 4, name: "Question Engine", status: "ok", fired: [], output: {} };
  const questionsAsked: string[]  = [];
  const answeredQIds: string[]    = [];
  const unansweredQIds: string[]  = [];

  for (const q of cfg.coreQuestions ?? []) {
    const shouldAsk = !q.askIf || evaluateExpr(q.askIf, tokens);
    if (shouldAsk) {
      questionsAsked.push(q.qId);
      qStep.fired.push({ ruleId: q.qId, ruleVersion: "1.0", ruleType: "question", fired: true });
      const answer = patientInput.answers[q.qId] ?? patientInput.answers[q.questionText];
      if (answer !== undefined) {
        tokens.set(q.qId.toLowerCase(), answer);
        answeredQIds.push(q.qId);
        _ctxMgr.updateWorking({
          answeredQuestions: [
            ..._ctxMgr.getContext().working.answeredQuestions,
            {
              questionId: q.qId,
              question:   q.questionText || q.qId,
              answer:     String(answer),
              answeredAt: nowIso(),
              extractedFindings: [`${q.qId}=${answer}`],
            },
          ],
        });
      } else {
        unansweredQIds.push(q.qId);
      }
    }
  }

  qStep.output = { questionsAsked: questionsAsked.length, answered: answeredQIds.length };
  steps.push(qStep);

  // T016 — Step 4: publish answered Q findings + unanswered as uncertainty
  answeredQIds.slice(0, 8).forEach((qId, i) => {
    const answer = patientInput.answers[qId];
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_qa_${sessionId}_s4_${i}`,
      type:       "validated_finding",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload:    { finding: `${qId}: ${answer}`, positiveOrNegative: "present", source: "history" },
      provenance: { source: "patient", citation: `pipeline:step4:q:${qId}` },
      estimatedTokens: 20,
    });
  });

  unansweredQIds.slice(0, 4).forEach((qId, i) => {
    const q = cfg!.coreQuestions?.find(cq => cq.qId === qId);
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_uncertainty_q_${sessionId}_s4_${i}`,
      type:       "uncertainty",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        question:      q?.questionText || qId,
        whyItMatters:  "Unanswered question that may affect differential or disposition",
        blockedAgents: ["differential", "disposition"],
      },
      provenance: { source: "rule_engine", citation: `pipeline:step4:unanswered:${qId}` },
      estimatedTokens: 30,
    });
    _ctxMgr.updateWorking({
      pendingQuestions: [
        ..._ctxMgr.getContext().working.pendingQuestions,
        {
          id:                   qId,
          text:                 q?.questionText || qId,
          purpose:              "Unanswered core question",
          discriminatesBetween: topDiagnoses.slice(0, 2).map(d => d.label),
          createdAtStep:        4,
        },
      ],
    });
  });

  // ── Step 5: Workup Selection ─────────────────────────────────────────────────
  runCompactionCheck({ step: 5, role: "differential", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 5: publish workup items as kb_retrieval
  if (workupOrdered.length > 0) {
    workupOrdered.slice(0, 5).forEach((item, i) => {
      safePub(_bus, _ctxMgr, "differential", {
        id:         `art_workup_${sessionId}_s5_${i}`,
        type:       "kb_retrieval",
        producedBy: "differential",
        producedAt: nowIso(),
        consumedBy: [],
        payload: {
          query:          `workup for ${complaintId}`,
          chunkId:        `workup_${item.toLowerCase().replace(/\s+/g, "_")}`,
          chunkText:      `Recommended workup item: ${item}`,
          relevanceScore: 0.85,
        },
        provenance: { source: "kb", citation: `pipeline:step5:workup:${item}` },
        estimatedTokens: 25,
      });
    });
  } else {
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_workup_fail_${sessionId}_s5`,
      type:       "failed_attempt",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        attempted:          `workup_lookup:${complaintId}`,
        outcome:            "No workup items matched the current token set",
        doNotRetryReason:   "Tokens not sufficient to trigger any workup rule",
      },
      provenance: { source: "rule_engine", citation: "pipeline:step5:no_workup_match" },
      estimatedTokens: 30,
    });
  }

  // ── Step 6: Red Flag Safety Screen ──────────────────────────────────────────
  runCompactionCheck({ step: 6, role: "triage", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 6: promote red flags into immutables AND publish to bus
  for (const rfId of redFlagsHit) {
    const rfRule = cfg.redFlagRules?.find(r => r.rfId === rfId);
    _ctxMgr.addRedFlag({
      id:           rfId,
      description:  rfRule?.label ?? rfId.replace(/_/g, " "),
      identifiedAt: nowIso(),
      identifiedBy: "rule_engine",
      source:       `pipeline:step6:${complaintId}`,
    });
    // T016 matrix row 2 — red flag rule result, positive
    safePub(_bus, _ctxMgr, "triage", {
      id:         `art_rf_pos_${sessionId}_s6_${rfId}`,
      type:       "validated_finding",
      producedBy: "triage",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        finding:            `RED FLAG: ${rfRule?.label ?? rfId} (${rfRule?.severity ?? "SOFT"})`,
        positiveOrNegative: "present",
        source:             "vitals",
      },
      provenance: { source: "rule_engine", citation: `pipeline:step6:rf:${rfId}` },
      estimatedTokens: 35,
    });
  }

  // T016 matrix row 2 — negative red flag result (when none fire)
  if (redFlagsHit.length === 0) {
    safePub(_bus, _ctxMgr, "triage", {
      id:         `art_rf_neg_${sessionId}_s6`,
      type:       "validated_finding",
      producedBy: "triage",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        finding:            "Red flag safety screen: NEGATIVE — no red flags triggered",
        positiveOrNegative: "absent",
        source:             "vitals",
      },
      provenance: { source: "rule_engine", citation: "pipeline:step6:rf_negative" },
      estimatedTokens: 30,
    });
  }

  // ── Step 7: Cluster Scoring ──────────────────────────────────────────────────
  runCompactionCheck({ step: 7, role: "differential", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 7: publish each cluster score as calculation + risk scores
  sortedClusters.slice(0, 4).forEach(([clusterId, score], i) => {
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_cluster_${sessionId}_s7_${i}`,
      type:       "calculation",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        scoreName:      `Cluster: ${clusterId}`,
        score,
        interpretation: score >= 3 ? "High likelihood cluster" : score >= 1 ? "Moderate" : "Low",
        inputs:         { clusterId, rawScore: score },
      },
      provenance: { source: "rule_engine", citation: `pipeline:step7:cluster:${clusterId}` },
      estimatedTokens: 40,
    });
  });

  // T016 matrix row 7 — risk score calculations (HEART-equivalent for chest pain)
  if (complaintId === "chest_pain" || complaintId.includes("cardiac")) {
    const heartScore = (patientInput.vitals?.hr ?? 0) > 100 ? 2 : 1;
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_heart_score_${sessionId}_s7`,
      type:       "calculation",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        scoreName:      "HEART Score (simplified)",
        score:          heartScore,
        interpretation: heartScore >= 3 ? "High risk — ED workup indicated" : "Low-moderate risk",
        inputs:         { hr: patientInput.vitals?.hr ?? 0, age: patientInput.age ?? 0 },
      },
      provenance: { source: "calculation", citation: "pipeline:step7:HEART" },
      estimatedTokens: 50,
    });
  }

  // ── Step 8: Diagnosis Ranking ────────────────────────────────────────────────
  runCompactionCheck({ step: 8, role: "differential", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 8: publish final ranking as calculation + bottom dx as ruled_out
  if (topDiagnoses.length > 0) {
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_dx_ranking_${sessionId}_s8`,
      type:       "calculation",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        scoreName:      "Diagnosis Ranking",
        score:          topDiagnoses[0]?.score ?? 0,
        interpretation: `Top: ${topDiagnoses[0]?.label ?? "unknown"} (score ${topDiagnoses[0]?.score ?? 0})`,
        inputs:         Object.fromEntries(topDiagnoses.slice(0, 5).map(d => [d.label, d.score])),
      },
      provenance: { source: "rule_engine", citation: "pipeline:step8:ranking" },
      estimatedTokens: 55,
    });
  }

  // Publish bottom-ranked dx as ruled_out (those with score < 5 after cluster scoring)
  topDiagnoses.filter(dx => dx.score < 5 && dx.rank > 5).slice(0, 3).forEach((dx, i) => {
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_ruleout_ranked_${sessionId}_s8_${i}`,
      type:       "ruled_out",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        diagnosis:    dx.label,
        reason:       `Post-cluster score ${dx.score} — below ranking threshold after cluster analysis`,
        evidence:     [],
        reconsiderIf: ["significant new finding contradicts current evidence"],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step8:low_rank_ruleout" },
      estimatedTokens: 40,
    });
  });

  // ── Step 9: Disposition Determination ───────────────────────────────────────
  runCompactionCheck({ step: 9, role: "disposition", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 9: publish candidate dispositions (including non-final alternatives)
  const allDispRules = cfg.dispositionRules ?? [];
  allDispRules.slice(0, 3).forEach((r, i) => {
    const isChosen = r.dispositionLevel === finalDisposition;
    safePub(_bus, _ctxMgr, "disposition", {
      id:         `art_disp_candidate_${sessionId}_s9_${i}`,
      type:       "decision",
      producedBy: "disposition",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        decision:               r.dispositionLevel,
        rationale:              isChosen ? "Rule matched — chosen disposition" : "Candidate disposition (not selected)",
        alternatives_considered: allDispRules.map(rd => rd.dispositionLevel).filter(d => d !== r.dispositionLevel).slice(0, 3),
      },
      provenance: { source: "rule_engine", citation: `pipeline:step9:disposition:${r.dispRuleId}` },
      estimatedTokens: 45,
    });
    if (isChosen) {
      _ctxMgr.updateWorking({
        candidateDispositions: [
          ..._ctxMgr.getContext().working.candidateDispositions,
          {
            type:          r.dispositionLevel as any,
            rationale:     "Rule-based disposition",
            preconditions: [],
            blockers:      [],
            proposedAtStep: 9,
          },
        ],
      });
    }
  });

  // T016 matrix row 12 — uncertainty if disposition is ambiguous
  if (!hardStopFired && allDispRules.length === 0) {
    safePub(_bus, _ctxMgr, "disposition", {
      id:         `art_disp_uncertainty_${sessionId}_s9`,
      type:       "uncertainty",
      producedBy: "disposition",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        question:      "No disposition rule matched — disposition cannot be determined from current data",
        whyItMatters:  "Patient disposition is unresolved",
        blockedAgents: ["billing", "supervisor"],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step9:no_disp_rule" },
      estimatedTokens: 40,
    });
  }

  // ── Step 10: Medication Group Selection ─────────────────────────────────────
  runCompactionCheck({ step: 10, role: "disposition", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 10: publish medication groups as decision; uncertainty if none
  if (medicationGroups.length > 0) {
    safePub(_bus, _ctxMgr, "disposition", {
      id:         `art_med_decision_${sessionId}_s10`,
      type:       "decision",
      producedBy: "disposition",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        decision:               `Medication groups selected: ${medicationGroups.join(", ")}`,
        rationale:              "Rule-based medication group selection",
        alternatives_considered: [],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step10:medication_groups" },
      estimatedTokens: 40,
    });
  } else {
    safePub(_bus, _ctxMgr, "disposition", {
      id:         `art_med_uncertainty_${sessionId}_s10`,
      type:       "uncertainty",
      producedBy: "disposition",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        question:      "No medication groups matched — pharmacotherapy not yet determined",
        whyItMatters:  "Plan may be incomplete without medication guidance",
        blockedAgents: ["billing"],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step10:no_med_match" },
      estimatedTokens: 35,
    });
  }

  // ── Step 11: Medication Safety Filters ──────────────────────────────────────
  runCompactionCheck({ step: 11, role: "disposition", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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

  // T016 — Step 11: publish blocked meds as uncertainty
  safetyFiltersApplied.slice(0, 4).forEach((filterLabel, i) => {
    safePub(_bus, _ctxMgr, "disposition", {
      id:         `art_med_safety_${sessionId}_s11_${i}`,
      type:       "uncertainty",
      producedBy: "disposition",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        question:      `Medication safety filter applied: ${filterLabel}`,
        whyItMatters:  "A contraindicated medication group was removed from the plan",
        blockedAgents: ["billing"],
      },
      provenance: { source: "rule_engine", citation: `pipeline:step11:safety_filter:${filterLabel}` },
      estimatedTokens: 30,
    });
  });

  // ── Supervisor Gate (T022) ───────────────────────────────────────────────────
  // Between steps 11 and 12.
  // Rule-based supervisor: reads ALL artifacts, checks for safety conditions.
  // Three exit paths:
  //   APPROVE       — no safety concern; pipeline continues to step 12.
  //   ADD_CONSTRAINT — hard red flag present but disposition is not ED; adds constraint and overrides.
  //   OVERRIDE      — (never fires in rule-based path; available via API endpoint).

  const supervisorArtifacts = _bus.readFor("supervisor");
  console.log(`[supervisor] gate: consuming ${supervisorArtifacts.length} artifacts`);

  const hasHardRedFlag = cfg.redFlagRules?.some(
    r => redFlagsHit.includes(r.rfId) && r.severity === "HARD",
  ) ?? false;

  const dispIsNonER = !["ER_SEND", "er_send", "ed_transfer"].includes(
    finalDisposition.toLowerCase(),
  );

  if (hasHardRedFlag && dispIsNonER) {
    // ADD_CONSTRAINT — supervisor forces ED redirect
    const constraint = `Supervisor gate: HARD red flag — ED transfer required (flags: ${redFlagsHit.join(", ")})`;
    _ctxMgr.addHardConstraint(constraint);
    finalDisposition = "ER_SEND";

    safePub(_bus, _ctxMgr, "supervisor", {
      id:         `art_supervisor_constraint_${sessionId}`,
      type:       "decision",
      producedBy: "supervisor",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        decision:               "ADD_CONSTRAINT",
        rationale:              constraint,
        alternatives_considered: ["original_disposition"],
      },
      provenance: { source: "rule_engine", citation: "supervisor:gate:hard_red_flag" },
      estimatedTokens: 50,
    });

    console.log(`[supervisor] ADD_CONSTRAINT — hard red flag override applied`);

    // T019 — write hard constraint to memory (fire-and-forget; non-blocking)
    writeSupervisorHardConstraint({
      tenantId:       _encCtx.immutables.tenantId,
      physicianId:    physicianId,
      complaintId,
      constraintSlug: `hard_rf_ed_redirect`,
      constraint,
      encounterId:    sessionId,
    }).catch(err => console.warn("[supervisor] memory write failed (non-critical):", err));
  } else {
    // APPROVE
    safePub(_bus, _ctxMgr, "supervisor", {
      id:         `art_supervisor_approve_${sessionId}`,
      type:       "decision",
      producedBy: "supervisor",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        decision:               "APPROVE",
        rationale:              "Supervisor gate: no safety concerns identified in assembled context",
        alternatives_considered: [],
      },
      provenance: { source: "rule_engine", citation: "supervisor:gate:auto_approve" },
      estimatedTokens: 35,
    });

    console.log(`[supervisor] APPROVE — disposition=${finalDisposition}, artifacts reviewed=${supervisorArtifacts.length}`);
  }

  // ── Step 12: Plan Finalization ───────────────────────────────────────────────
  runCompactionCheck({ step: 12, role: "disposition", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

  const planStep: PipelineStepResult = { step: 12, name: "Plan Finalization", status: "ok", fired: [], output: {} };

  const outputTemplate = cfg.outputTemplates?.find(t => {
    const tRow = t as Record<string, any>;
    const level = getAny(tRow, ["DISPOSITION_LEVEL", "LEVEL"]);
    return level.toLowerCase() === finalDisposition.toLowerCase();
  }) ?? cfg.outputTemplates?.[0];

  if (outputTemplate) {
    const tRow     = outputTemplate as Record<string, any>;
    const tmplText = getAny(tRow, ["TEMPLATE_TEXT", "PLAN_TEXT", "OUTPUT_TEXT", "body", "BODY"]);
    planText = tmplText
      .replace("{disposition}", finalDisposition)
      .replace("{complaint}",   complaintId.replace(/_/g, " "))
      .replace("{top_dx}",      topDiagnoses[0]?.label ?? "uncertain")
      .replace("{med_groups}",  medicationGroups.join(", ") || "none selected")
      .replace("{workup}",      workupOrdered.join(", ") || "none indicated");
  }

  planStep.output = { planText: planText.slice(0, 500), templateFound: !!outputTemplate };
  steps.push(planStep);

  // T016 — Step 12: publish plan as disposition decision
  safePub(_bus, _ctxMgr, "disposition", {
    id:         `art_plan_${sessionId}_s12`,
    type:       "decision",
    producedBy: "disposition",
    producedAt: nowIso(),
    consumedBy: [],
    payload: {
      decision:               `Final plan: disposition=${finalDisposition}`,
      rationale:              planText.slice(0, 200) || "Template-based plan",
      alternatives_considered: [],
    },
    provenance: { source: "rule_engine", citation: "pipeline:step12:plan_finalization" },
    estimatedTokens: 60,
  });

  if (!outputTemplate) {
    safePub(_bus, _ctxMgr, "disposition", {
      id:         `art_plan_uncertainty_${sessionId}_s12`,
      type:       "uncertainty",
      producedBy: "disposition",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        question:      "No output template matched the final disposition — plan text is missing",
        whyItMatters:  "Patient cannot receive a complete care plan",
        blockedAgents: ["billing"],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step12:no_template" },
      estimatedTokens: 35,
    });
  }

  // ── Step 13: Audit Trail ─────────────────────────────────────────────────────
  runCompactionCheck({ step: 13, role: "billing", ctxMgr: _ctxMgr, bus: _bus, compactor: _compactor, sessionId });

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
      firedRules.push({ ruleId: rId, ruleVersion: "1.0", ruleType: "kb_rule", fired: true }),
    );
  }

  // T016 matrix row 10 — publish KB chunks as kb_retrieval (differential role is the retriever)
  if (kbResult && kbResult.matchedRules?.length) {
    kbResult.matchedRules.slice(0, 4).forEach((rule: any, i: number) => {
      safePub(_bus, _ctxMgr, "differential", {
        id:         `art_kb_${sessionId}_s13_${i}`,
        type:       "kb_retrieval",
        producedBy: "differential",
        producedAt: nowIso(),
        consumedBy: [],
        payload: {
          query:          `guidelines for ${complaintId}`,
          chunkId:        rule.ruleId ?? `kb_chunk_${i}`,
          chunkText:      rule.explanation ?? rule.logicDescription ?? JSON.stringify(rule).slice(0, 200),
          relevanceScore: 0.9,
        },
        provenance: { source: "kb", kbChunkIds: [rule.ruleId ?? `kb_${i}`], citation: `pipeline:step13:kb` },
        estimatedTokens: 50,
      });
    });
  } else {
    safePub(_bus, _ctxMgr, "differential", {
      id:         `art_kb_fail_${sessionId}_s13`,
      type:       "failed_attempt",
      producedBy: "differential",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        attempted:          `kb_query:${complaintId}`,
        outcome:            "KB query returned no matched rules",
        doNotRetryReason:   "Complaint not yet covered in KB or query failed",
      },
      provenance: { source: "kb", citation: "pipeline:step13:kb_empty" },
      estimatedTokens: 30,
    });
  }

  // T016 matrix row 13 — billing CPT/E&M codes
  const cptCode = finalDisposition.toUpperCase().includes("ER") ? "99285"
    : finalDisposition.toLowerCase().includes("urgent") ? "99214"
    : "99213";
  safePub(_bus, _ctxMgr, "billing", {
    id:         `art_cpt_${sessionId}_s13`,
    type:       "decision",
    producedBy: "billing",
    producedAt: nowIso(),
    consumedBy: [],
    payload: {
      decision:               `CPT: ${cptCode} — ${finalDisposition}`,
      rationale:              `E&M code based on disposition level: ${finalDisposition}`,
      alternatives_considered: ["99202", "99203", "99213", "99214", "99285"].filter(c => c !== cptCode),
    },
    provenance: { source: "rule_engine", citation: "pipeline:step13:billing:cpt" },
    estimatedTokens: 40,
  });

  // T016 matrix row 13 — documentation gaps (billing uncertainty)
  const docGaps: string[] = [];
  if (!patientInput.vitals || Object.keys(patientInput.vitals).length === 0) {
    docGaps.push("Missing vitals — required for E&M complexity scoring");
  }
  if (!patientInput.pmh?.length) {
    docGaps.push("Missing PMH documentation — affects medical decision-making complexity");
  }
  if (docGaps.length > 0) {
    safePub(_bus, _ctxMgr, "billing", {
      id:         `art_billing_gaps_${sessionId}_s13`,
      type:       "decision",
      producedBy: "billing",
      producedAt: nowIso(),
      consumedBy: [],
      payload: {
        decision:               `Documentation gaps: ${docGaps.join("; ")}`,
        rationale:              "These gaps may block clean claim submission",
        alternatives_considered: [],
      },
      provenance: { source: "rule_engine", citation: "pipeline:step13:billing:doc_gaps" },
      estimatedTokens: 45,
    });
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
    output: {
      auditId, staleConfig, staleWarning,
      totalRulesFired: firedRules.length,
      totalArtifacts:  _bus.all().length,
    },
    warnings: staleWarning ? [staleWarning] : undefined,
  });

  // Persist final context to inspector cache
  _ctxMgr.updateWorking({ step: 13, currentAgent: "supervisor" });
  const _finalCtx = _ctxMgr.getContext();
  storeEncounterContext(sessionId, sessionId, _finalCtx);

  console.log(
    `[pipeline] complete — sessionId=${sessionId} artifacts=${_bus.all().length} ` +
    `distinct_types=${new Set(_bus.all().map(a => a.type)).size} disposition=${finalDisposition}`,
  );

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
    encounterContext:     _finalCtx,
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
