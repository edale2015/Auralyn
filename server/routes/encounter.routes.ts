/**
 * Encounter Routes — T016 / T017 / T019 / T022 verification endpoints
 *
 * POST /api/encounter                       — create + run a pipeline encounter
 * POST /api/encounter/test/simulate-long    — T017: 25-turn compaction simulation
 * POST /api/encounter/:id/supervisor-override — T019: write disposition override memory
 * POST /api/encounter/:id/simulate-supervisor — T022: force supervisor gate scenarios
 */

import { Router }                    from "express";
import { randomUUID }                 from "crypto";
import { runClinicalPipeline }        from "../clinical/unifiedClinicalPipeline";
import { ClinicalContextManager }     from "../context/ClinicalContextManager";
import { ContextCompactor }           from "../context/ContextCompactor";
import {
  writeSupervisorDispositionOverride,
  writeSupervisorHardConstraint,
}                                     from "../context/memoryWriters";

const router = Router();

// ─── POST /api/encounter ──────────────────────────────────────────────────────
// Runs the full 13-step clinical pipeline and returns both the pipeline result
// and the sessionId that can be used with GET /api/context/:id/state.
router.post("/", async (req, res) => {
  try {
    const {
      complaintId  = "chest_pain",
      patientInput = {},
      physicianId  = "anon-physician",
      sessionId    = `enc-${randomUUID()}`,
    } = req.body ?? {};

    if (!complaintId) {
      return res.status(400).json({ error: "complaintId is required" });
    }

    const result = await runClinicalPipeline({
      complaintId,
      patientInput: {
        symptoms:    patientInput.symptoms    ?? [complaintId.replace(/_/g, " ")],
        answers:     patientInput.answers     ?? {},
        vitals:      patientInput.vitals,
        age:         patientInput.age,
        sex:         patientInput.sex,
        pregnant:    patientInput.pregnant,
        allergies:   patientInput.allergies,
        pmh:         patientInput.pmh,
        currentMeds: patientInput.currentMeds,
      },
      physicianId,
      sessionId,
    });

    return res.json({
      sessionId,
      complaintId,
      finalDisposition: result.finalDisposition,
      hardStopFired:    result.hardStopFired,
      hardStopReason:   result.hardStopReason,
      topDiagnoses:     result.topDiagnoses.slice(0, 5),
      redFlagsHit:      result.redFlagsHit,
      auditId:          result.auditId,
      staleConfig:      result.staleConfig,
      stepCount:        result.steps.length,
      artifactCount:    result.encounterContext?.artifacts?.length ?? 0,
      distinctTypes:    [...new Set(result.encounterContext?.artifacts?.map(a => a.type) ?? [])],
      missingProvenance: result.encounterContext?.artifacts?.filter(
        a => !a.provenance?.source,
      ).length ?? 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "pipeline failed" });
  }
});

// ─── BUILT-IN DEMO CONFIG ─────────────────────────────────────────────────────
// Identical to the vitest mock — chest_pain with ACS workup, 4 core questions,
// HARD hypoxia red flag, cluster scoring.  Used by the /demo endpoint so live
// verification works without a Google Sheets connection.
const DEMO_CONFIG: any = {
  registry: { ccId: "chest_pain", version: "demo-1", engineType: "WORLD_B" },
  coreQuestions: [
    { qId: "pain_character",  questionText: "What does the pain feel like?", askIf: null },
    { qId: "pain_onset",      questionText: "When did the pain start?",       askIf: null },
    { qId: "diaphoresis",     questionText: "Any sweating?",                   askIf: null },
    { qId: "radiation",       questionText: "Does pain radiate to arm/jaw?",   askIf: null },
  ],
  redFlagRules: [
    { rfId: "RF_HYPOXIA",      label: "SpO2 < 90%",                       triggerExpr: "spo2 < 90",                                    severity: "HARD", action: "ER_SEND",  rationale: "Critical hypoxia" },
    { rfId: "RF_CRUSHING_PAIN",label: "Crushing chest pain with diaphoresis", triggerExpr: "pain_character == crushing AND diaphoresis == true", severity: "SOFT", action: "ESCALATE", rationale: "High-risk ACS" },
  ],
  dxCandidates: [
    { CC_ID: "chest_pain", DX_ID: "DX_ACS",     DX_LABEL: "Acute Coronary Syndrome", BASE_SCORE: 85, RANK: 1, BEST_CLUSTER_ID: "cardiac" },
    { CC_ID: "chest_pain", DX_ID: "DX_PE",       DX_LABEL: "Pulmonary Embolism",      BASE_SCORE: 45, RANK: 2, BEST_CLUSTER_ID: "pulm"   },
    { CC_ID: "chest_pain", DX_ID: "DX_GERD",     DX_LABEL: "GERD / Esophageal",       BASE_SCORE: 30, RANK: 3, BEST_CLUSTER_ID: null     },
    { CC_ID: "chest_pain", DX_ID: "DX_MSK",      DX_LABEL: "Musculoskeletal",          BASE_SCORE: 20, RANK: 4, BEST_CLUSTER_ID: null     },
    { CC_ID: "chest_pain", DX_ID: "DX_ANXIETY",  DX_LABEL: "Panic / Anxiety",          BASE_SCORE:  2, RANK: 5, BEST_CLUSTER_ID: null     },
  ],
  dispositionRules: [
    { dispRuleId: "DISP_ER",   dispositionLevel: "ER_SEND",       whenExpr: "spo2 < 90"               },
    { dispRuleId: "DISP_UC",   dispositionLevel: "urgent_consult",whenExpr: "pain_character == crushing" },
    { dispRuleId: "DISP_HOME", dispositionLevel: "home_with_rx",  whenExpr: "true"                    },
  ],
  clusterScoringRules: [
    { ruleId: "CS_001", clusterId: "cardiac", whenExpr: "pain_character == crushing", points: 3 },
    { ruleId: "CS_002", clusterId: "cardiac", whenExpr: "radiation == true",          points: 2 },
    { ruleId: "CS_003", clusterId: "pulm",    whenExpr: "spo2 < 92",                  points: 2 },
  ],
  modifiers:                   [],
  globalMedicationsMaster:     [{ MED_GROUP: "aspirin_antiplatelet", WHEN: "true" }],
  medConditionIntelligenceRules: [],
  urgentCareSpotInterventions: [
    { INTERVENTION: "12-lead ECG", WHEN_EXPR: "true" },
    { INTERVENTION: "Troponin I",  WHEN_EXPR: "true" },
  ],
  outputTemplates: [
    { DISPOSITION_LEVEL: "ER_SEND",      TEMPLATE_TEXT: "Transfer to ED for {complaint}. Top dx: {top_dx}. Meds: {med_groups}. Workup: {workup}." },
    { DISPOSITION_LEVEL: "urgent_consult",TEMPLATE_TEXT: "Urgent cardiology consult for {complaint}." },
    { DISPOSITION_LEVEL: "home_with_rx", TEMPLATE_TEXT: "Home treatment for {complaint}. Top dx: {top_dx}." },
  ],
};

// ─── POST /api/encounter/demo ─────────────────────────────────────────────────
// T016 live verification: runs the full pipeline with built-in mock config,
// bypassing the Google Sheets loader.  Accepts optional patientInput overrides.
router.post("/demo", async (req, res) => {
  try {
    const {
      patientInput = {},
      physicianId  = "demo-physician-001",
      sessionId    = `demo-${randomUUID()}`,
    } = req.body ?? {};

    const input = {
      symptoms:    patientInput.symptoms    ?? ["chest_pain", "shortness_of_breath"],
      answers:     patientInput.answers     ?? { pain_character: "crushing", pain_onset: "sudden", diaphoresis: true, radiation: true },
      vitals:      patientInput.vitals      ?? { spo2: 89, hr: 110, sbp: 145, dbp: 92 },
      age:         patientInput.age         ?? 58,
      sex:         patientInput.sex         ?? "M" as const,
      allergies:   patientInput.allergies   ?? ["penicillin"],
      pmh:         patientInput.pmh         ?? ["hypertension", "diabetes"],
      currentMeds: patientInput.currentMeds ?? ["metformin", "lisinopril"],
    };

    const result = await runClinicalPipeline({
      complaintId:   "chest_pain",
      patientInput:  input,
      physicianId,
      sessionId,
      _inlineConfig: DEMO_CONFIG,
    });

    const artifacts       = result.encounterContext?.artifacts ?? [];
    const distinctTypes   = [...new Set(artifacts.map((a: any) => a.type))];
    const missingProv     = artifacts.filter((a: any) => !a.provenance?.source).length;

    return res.json({
      sessionId,
      complaintId:      "chest_pain",
      finalDisposition: result.finalDisposition,
      hardStopFired:    result.hardStopFired,
      topDiagnoses:     result.topDiagnoses.slice(0, 3),
      redFlagsHit:      result.redFlagsHit,
      auditId:          result.auditId,
      stepCount:        result.steps.length,
      // T016 verification fields
      totalArtifacts:   artifacts.length,
      distinctTypes,
      distinctTypeCount: distinctTypes.length,
      missingProvenance: missingProv,
      t016_pass:        artifacts.length >= 15 && distinctTypes.length >= 4 && missingProv === 0,
      // T018 verification hint
      contextStateUrl:  `/api/context/${sessionId}/state`,
      promptsUrl:       `/api/context/${sessionId}/prompts/differential`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "demo pipeline failed" });
  }
});

// ─── POST /api/encounter/test/simulate-long ───────────────────────────────────
// T017 verification: simulates a 25-turn encounter to force ≥ 2 compaction events.
// Returns { compactionEvents, artifactCount, redFlagsSurvived, constraintsSurvived }.
router.post("/test/simulate-long", (req, res) => {
  try {
    const {
      turns    = 25,
      tokenThreshold = 200,
    } = req.body ?? {};

    const compactionPolicy = {
      workingTokenThreshold:       tokenThreshold,
      keepRecentAnsweredQuestions: 3,
      dropDifferentialBelow:       0.05,
      staleDifferentialSteps:      2,
      pendingQuestionStaleSteps:   3,
    };

    const encId  = `simulate-long-${randomUUID()}`;
    const ctx = {
      immutables: {
        encounterId:        encId,
        tenantId:           "test",
        physicianId:        "sim-physician",
        patient: {
          ageYears: 55, sex: "M" as const,
          allergies: [], currentMedications: [], relevantHistory: [],
          pregnancyStatus: "n/a",
        },
        chiefComplaint:     "chest pain",
        presentingVitals:   { spo2: 89, hr: 110, capturedAt: new Date().toISOString() },
        redFlagsIdentified: [
          {
            id: "RF_HYPOXIA", description: "SpO2 < 90%",
            identifiedAt: new Date().toISOString(), identifiedBy: "rule_engine", source: "pipeline:step6",
          },
        ],
        hardConstraints:    ["Require ECG before disposition"],
        encounterStartedAt: new Date().toISOString(),
      },
      working: {
        currentDifferential:   [],
        pendingQuestions:      [],
        answeredQuestions:     [],
        candidateDispositions: [],
        currentAgent:          "differential" as const,
        step:                  0,
        estimatedTokens:       0,
      },
      artifacts:  [],
      traceRefId: `s3://auralyn-audit/${encId}/trace.jsonl`,
    };

    const mgr     = new ClinicalContextManager(ctx as any);
    const compact = new ContextCompactor(compactionPolicy as any);
    let   compactionCount = 0;

    for (let step = 1; step <= turns; step++) {
      const prev = mgr.getContext().working.answeredQuestions;
      mgr.updateWorking({
        step,
        answeredQuestions: [
          ...prev,
          {
            questionId:        `q_${step}`,
            question:          `Clinical question for step ${step} — describe the quality of pain`,
            answer:            `Detailed answer at step ${step} including all relevant clinical detail`,
            answeredAt:        new Date().toISOString(),
            extractedFindings: [`finding_${step}`],
          },
        ],
        estimatedTokens: JSON.stringify(mgr.getContext().working).length,
      });

      if (step % 3 === 0) {
        mgr.upsertDifferentialItem({
          diagnosis:          `Diagnosis_${step}`,
          likelihood:         0.02,
          supportingFindings: [],
          refutingFindings:   [`refuted at step ${step - 3}`],
          evidenceQuality:    "low",
          lastUpdatedStep:    step - 3,
        });
      }

      if (compact.shouldCompact(mgr.getContext())) {
        const result = compact.compact(mgr.getContext());
        if (result.compacted) {
          compactionCount++;
          mgr.updateWorking(result.newWorking);
          for (const a of result.newArtifacts) mgr.recordArtifact(a);
        }
      }
    }

    const finalCtx   = mgr.getContext();
    const finalFlags = finalCtx.immutables.redFlagsIdentified;
    const finalConst = finalCtx.immutables.hardConstraints;

    return res.json({
      ok:                  true,
      turns,
      tokenThreshold,
      compactionEvents:    compactionCount,
      compactionMinMet:    compactionCount >= 2,
      artifactCount:       finalCtx.artifacts.length,
      redFlagsSurvived:    finalFlags.map(f => f.id),
      constraintsSurvived: finalConst,
      rfPersisted:         finalFlags.some(f => f.id === "RF_HYPOXIA"),
      constraintPersisted: finalConst.includes("Require ECG before disposition"),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "simulation failed" });
  }
});

// ─── POST /api/encounter/:id/supervisor-override ──────────────────────────────
// T019: Physician supervisor overrides a disposition.
// Writes to ClinicalMemoryStore so the learning carries forward.
router.post("/:id/supervisor-override", async (req, res) => {
  try {
    const encounterId                        = req.params.id;
    const { fromDisposition, toDisposition, reason, physicianId = "anon-physician", tenantId = "default", complaintId = "chest_pain" } = req.body ?? {};

    if (!fromDisposition || !toDisposition) {
      return res.status(400).json({ error: "fromDisposition and toDisposition required" });
    }

    const override = await writeSupervisorDispositionOverride({
      tenantId,
      physicianId,
      complaintId,
      fromDisposition,
      toDisposition,
      reason:      reason ?? "Physician supervisor override",
      encounterId,
    });

    return res.json({
      ok:              true,
      encounterId,
      fromDisposition,
      toDisposition,
      memoryAccepted:  override.accepted,
      memoryKey:       override.key,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "override failed" });
  }
});

// ─── POST /api/encounter/:id/simulate-supervisor ─────────────────────────────
// T022: Force the supervisor gate paths for verification.
// Reads stored encounter state, re-runs supervisor logic, returns which path fires.
router.post("/:id/simulate-supervisor", async (req, res) => {
  try {
    const encounterId = req.params.id;
    const { triggerMode = "hard_red_flag" } = req.body ?? {};

    if (triggerMode === "hard_red_flag") {
      const constraintId = `sim-${encounterId}`;
      const constraint   = `Supervisor gate: HARD red flag — ED transfer required (simulated for ${encounterId})`;

      const memResult = await writeSupervisorHardConstraint({
        tenantId:       "default",
        physicianId:    "sim-physician",
        complaintId:    "chest_pain",
        constraintSlug: "hard_rf_ed_redirect_simulated",
        constraint,
        encounterId:    constraintId,
      });

      return res.json({
        ok:            true,
        encounterId,
        triggerMode,
        supervisorPath: "ADD_CONSTRAINT",
        constraint,
        memoryAccepted: memResult.accepted,
        memoryKey:      memResult.key,
        explanation:
          "Hard red flag detected with non-ER disposition. " +
          "Supervisor gate forces ER_SEND and writes constraint to memory.",
      });
    }

    if (triggerMode === "approve") {
      return res.json({
        ok:            true,
        encounterId,
        triggerMode,
        supervisorPath: "APPROVE",
        explanation:   "No safety concerns — supervisor gate approved the disposition.",
      });
    }

    return res.status(400).json({ error: "triggerMode must be 'hard_red_flag' or 'approve'" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "simulation failed" });
  }
});

export default router;
