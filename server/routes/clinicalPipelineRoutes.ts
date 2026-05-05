import { Router, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { kbKnowledgeChanges } from "../../shared/schema";
import {
  listAvailableComplaints,
  loadComplaintConfig,
  type ComplaintConfig,
  type SheetRow,
} from "../services/complaintConfigLoader";
import {
  evaluateExpr,
  evaluateRowExpr,
  buildClinicalTokens,
  type ClinicalTokens,
} from "../clinical/clinicalExprEvaluator";
import {
  asSheetRows,
  RedFlagRuleGuard,
  ClusterScoringGuard,
  ScoringDefGuard,
  DispositionRuleGuard,
  DxCandidateGuard,
  OutputTemplateGuard,
} from "../clinical/pipelineSafetyPatches";

const router = Router();

router.use(requireRole(["admin", "physician", "clinician"]));

type PipelineLayerKey =
  | "complaintIdentification"
  | "differentialDiagnosis"
  | "modifiers"
  | "questions"
  | "workup"
  | "medication"
  | "redFlags"
  | "clusterScoring"
  | "diagnosisRanking"
  | "dispositionPlan"
  | "audit";

type PipelineSourceMapEntry = {
  key: PipelineLayerKey;
  stage: string;
  step: string;
  label: string;
  unit: string;
  sourceTables: string[];
  purpose: string;
};

const WORLD_B_PIPELINE_SOURCE_MAP: PipelineSourceMapEntry[] = [
  {
    key: "complaintIdentification",
    stage: "complaint_identification",
    step: "1",
    label: "Step 1 — Complaint Identification",
    unit: "complaint",
    sourceTables: ["COMPLAINT_REGISTRY"],
    purpose: "Normalize complaint_id, aliases, enabled engine, graph, versions, and system/category.",
  },
  {
    key: "differentialDiagnosis",
    stage: "differential_diagnosis",
    step: "2",
    label: "Step 2 — Differential Diagnosis / Rule-Out Targets",
    unit: "diagnosis",
    sourceTables: ["CLUSTER_PRIMARY_DIAGNOSIS", "GLOBAL_CLUSTER_MASTER", "SCORING_DEFS", "DX_CANDIDATES"],
    purpose: "Establish early rule-out targets immediately after chief complaint so questions and workup know what they are ruling out.",
  },
  {
    key: "modifiers",
    stage: "modifier_collection",
    step: "3A",
    label: "Step 3A — Modifier Collection",
    unit: "modifier",
    sourceTables: ["MODIFIERS", "GLOBAL_MODIFIERS", "GLOBAL_MODIFIERS_CLEAN", "CARDS_MODIFIER_MASTER"],
    purpose: "Collect risk modifiers such as PMH, meds, pregnancy, allergies, anticoagulants, immune status, and cardio-specific context.",
  },
  {
    key: "questions",
    stage: "question_engine",
    step: "3B",
    label: "Step 3B — Question Engine",
    unit: "question",
    sourceTables: ["CORE_QUESTIONS", "GLOBAL_SECONDARY"],
    purpose: "Ask complaint-specific and global secondary questions after differential and modifier context are known.",
  },
  {
    key: "workup",
    stage: "workup_selection",
    step: "4",
    label: "Step 4 — Workup Selection",
    unit: "workup",
    sourceTables: ["URGENT_CARE_SPOT_INTERVENTIONS"],
    purpose: "Select tests, procedures, vitals, imaging, or urgent-care interventions relevant to the differential and answers.",
  },
  {
    key: "medication",
    stage: "medication_safety",
    step: "5",
    label: "Step 5 — Medication Selection / Safety",
    unit: "medication",
    sourceTables: ["GLOBAL_MEDICATIONS_MASTER", "MED_CONDITION_INTELLIGENCE_RULES"],
    purpose: "Suggest medication candidates and safety blocks with condition, interaction, pregnancy, allergy, renal, and hepatic context.",
  },
  {
    key: "redFlags",
    stage: "red_flag_screen",
    step: "6",
    label: "Step 6 — Safety Screen (Red Flags)",
    unit: "red flag",
    sourceTables: ["RED_FLAG_RULES", "RED_FLAGS_MASTER"],
    purpose: "Run red-flag detection and standardize escalation signals. Triggered hard red flags still force escalation even though shown as Step 6.",
  },
  {
    key: "clusterScoring",
    stage: "cluster_scoring",
    step: "7",
    label: "Step 7 — Cluster Scoring",
    unit: "cluster scoring",
    sourceTables: ["CLUSTER_SCORING_RULES", "SCORING_SYSTEMS", "SCORING_DEFS"],
    purpose: "Score evidence clusters using deterministic sheet rules and scoring metadata.",
  },
  {
    key: "diagnosisRanking",
    stage: "diagnosis_ranking",
    step: "8",
    label: "Step 8 — Diagnosis Ranking / Differential Refinement",
    unit: "diagnosis",
    sourceTables: ["CLUSTER_PRIMARY_DIAGNOSIS", "GLOBAL_CLUSTER_MASTER", "DX_CANDIDATES"],
    purpose: "Refine the early differential after modifier, question, workup, medication-safety, red-flag, and cluster evidence is known.",
  },
  {
    key: "dispositionPlan",
    stage: "disposition_plan",
    step: "9",
    label: "Step 9 — Disposition + Plan",
    unit: "disposition + plan",
    sourceTables: ["DISPOSITION_RULES", "OUTPUT_TEMPLATES"],
    purpose: "Merge care route with plan/rationale language so plan text is tied to a disposition rule and priority.",
  },
  {
    key: "audit",
    stage: "audit_trail",
    step: "13",
    label: "Step 13 — Audit Trail",
    unit: "audit event",
    sourceTables: ["audit_logs", "appendAuditEvent"],
    purpose: "Record the clinical decision-support trace and physician action in the tamper-evident audit chain.",
  },
];

function normalizeFeature(value: any): string {
  return String(value ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// buildClinicalTokens (from clinicalExprEvaluator) is used in buildTrace below.

function getAny(row: SheetRow, keys: string[], fallback = ""): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return fallback;
}

function toSourceRows(rows: SheetRow[], sourceTable: string): SheetRow[] {
  return rows.map(row => ({ ...row, __sourceTable: sourceTable }));
}

function layer(rows: SheetRow[], sourceTables: string[], unit: string) {
  return {
    count: rows.length,
    rows,
    sourceTables,
    unit,
  };
}

function buildEarlyDifferentialRows(cfg: ComplaintConfig): SheetRow[] {
  return [
    ...toSourceRows(cfg.clusterPrimaryDiagnosis, "CLUSTER_PRIMARY_DIAGNOSIS"),
    ...toSourceRows(cfg.globalClusterMaster, "GLOBAL_CLUSTER_MASTER"),
    ...toSourceRows(asSheetRows(cfg.scoringDefs, ScoringDefGuard), "SCORING_DEFS"),
    ...toSourceRows(asSheetRows(cfg.dxCandidates, DxCandidateGuard), "DX_CANDIDATES"),
  ];
}

function buildDiagnosisRankingRows(cfg: ComplaintConfig): SheetRow[] {
  return [
    ...toSourceRows(asSheetRows(cfg.dxCandidates, DxCandidateGuard), "DX_CANDIDATES"),
    ...toSourceRows(cfg.clusterPrimaryDiagnosis, "CLUSTER_PRIMARY_DIAGNOSIS"),
    ...toSourceRows(cfg.globalClusterMaster, "GLOBAL_CLUSTER_MASTER"),
  ];
}

function buildDispositionPlanRows(cfg: ComplaintConfig): SheetRow[] {
  return [
    ...toSourceRows(asSheetRows(cfg.dispositionRules, DispositionRuleGuard), "DISPOSITION_RULES"),
    ...toSourceRows(asSheetRows(cfg.outputTemplates, OutputTemplateGuard), "OUTPUT_TEMPLATES"),
  ];
}

function buildPipelineLayers(cfg: ComplaintConfig) {
  const differentialRows = buildEarlyDifferentialRows(cfg);
  const diagnosisRows = buildDiagnosisRankingRows(cfg);
  const dispositionPlanRows = buildDispositionPlanRows(cfg);

  return {
    complaintIdentification: layer(
      [{ ...cfg.registry, __sourceTable: "COMPLAINT_REGISTRY" }],
      ["COMPLAINT_REGISTRY"],
      "complaint"
    ),
    differentialDiagnosis: layer(
      differentialRows,
      ["CLUSTER_PRIMARY_DIAGNOSIS", "GLOBAL_CLUSTER_MASTER", "SCORING_DEFS", "DX_CANDIDATES"],
      "diagnosis"
    ),
    modifiers: layer(
      cfg.modifiers,
      ["MODIFIERS", "GLOBAL_MODIFIERS", "GLOBAL_MODIFIERS_CLEAN", "CARDS_MODIFIER_MASTER"],
      "modifier"
    ),
    questions: layer(
      [
        ...toSourceRows(cfg.coreQuestions as SheetRow[], "CORE_QUESTIONS"),
        ...toSourceRows(cfg.globalSecondary, "GLOBAL_SECONDARY"),
      ],
      ["CORE_QUESTIONS", "GLOBAL_SECONDARY"],
      "question"
    ),
    workup: layer(
      cfg.urgentCareSpotInterventions,
      ["URGENT_CARE_SPOT_INTERVENTIONS"],
      "workup"
    ),
    medication: layer(
      [
        ...toSourceRows(cfg.globalMedicationsMaster, "GLOBAL_MEDICATIONS_MASTER"),
        ...toSourceRows(cfg.medConditionIntelligenceRules, "MED_CONDITION_INTELLIGENCE_RULES"),
      ],
      ["GLOBAL_MEDICATIONS_MASTER", "MED_CONDITION_INTELLIGENCE_RULES"],
      "medication"
    ),
    redFlags: layer(
      [
        ...toSourceRows(asSheetRows(cfg.redFlagRules, RedFlagRuleGuard), "RED_FLAG_RULES"),
        ...toSourceRows(cfg.redFlagsMaster, "RED_FLAGS_MASTER"),
      ],
      ["RED_FLAG_RULES", "RED_FLAGS_MASTER"],
      "red flag"
    ),
    clusterScoring: layer(
      [
        ...toSourceRows(asSheetRows(cfg.clusterScoringRules, ClusterScoringGuard), "CLUSTER_SCORING_RULES"),
        ...toSourceRows(cfg.scoringSystems, "SCORING_SYSTEMS"),
        ...toSourceRows(asSheetRows(cfg.scoringDefs, ScoringDefGuard), "SCORING_DEFS"),
      ],
      ["CLUSTER_SCORING_RULES", "SCORING_SYSTEMS", "SCORING_DEFS"],
      "cluster scoring"
    ),
    diagnosisRanking: layer(
      diagnosisRows,
      ["CLUSTER_PRIMARY_DIAGNOSIS", "GLOBAL_CLUSTER_MASTER", "DX_CANDIDATES"],
      "diagnosis"
    ),
    dispositionPlan: layer(
      dispositionPlanRows,
      ["DISPOSITION_RULES", "OUTPUT_TEMPLATES"],
      "disposition + plan"
    ),
    audit: layer(
      [{ source: "appendAuditEvent", __sourceTable: "audit_logs", note: "Trace is auditable; physician approval actions must append clinical audit events." }],
      ["audit_logs", "appendAuditEvent"],
      "audit event"
    ),
  };
}

// evaluateExpr / evaluateRowExpr / buildClinicalTokens imported from clinicalExprEvaluator.
// These replace the old tokenizeInput / exprMatches / rowMatchesInput implementations.
// Key behavioral differences:
//   - evaluateExpr handles AND/OR/NOT correctly (old exprMatches ignored AND/NOT)
//   - evaluateExpr handles numeric thresholds (O2_sat < 94)
//   - evaluateRowExpr returns false when no expr field found (old rowMatchesInput scanned ALL row values)

function compactRow(row: SheetRow, sourceTable = row.__sourceTable) {
  const id = getAny(row, ["RULE_ID", "ruleId", "RF_ID", "rfId", "Q_ID", "qId", "DX_ID", "dxId", "CLUSTER_ID", "clusterId", "DISP_RULE_ID", "dispRuleId", "TEMPLATE_ID", "templateId", "MEDICATION_NAME", "Medication_Name", "id"], "—");
  const label = getAny(row, ["DX_LABEL", "diagnosis", "diagnosisLabel", "LABEL", "label", "QUESTION_TEXT", "questionText", "DESCRIPTION", "description", "EVIDENCE_LABEL", "evidenceLabel", "DISPOSITION_LEVEL", "dispositionLevel", "BODY", "Medication_Name", "MEDICATION_NAME"], id);
  return {
    id,
    label,
    sourceTable,
    raw: row,
  };
}

function buildTrace(cfg: ComplaintConfig, symptoms: string[], freeText: string) {
  // Build ClinicalTokens map — supports full boolean/threshold expression evaluation.
  // freeText words are added as symptom-presence tokens.
  const allSymptoms = [
    ...symptoms,
    ...String(freeText ?? "").split(/[^a-zA-Z0-9]+/).map(s => s.trim()).filter(Boolean),
  ];
  const tokens: ClinicalTokens = buildClinicalTokens({ symptoms: allSymptoms });

  const earlyDifferentialRows = buildEarlyDifferentialRows(cfg);
  const modifierRows = cfg.modifiers;
  const questionRows = [
    ...toSourceRows(cfg.coreQuestions as SheetRow[], "CORE_QUESTIONS"),
    ...toSourceRows(cfg.globalSecondary, "GLOBAL_SECONDARY"),
  ];
  const workupRows = cfg.urgentCareSpotInterventions;
  const medicationRows = [
    ...toSourceRows(cfg.globalMedicationsMaster, "GLOBAL_MEDICATIONS_MASTER"),
    ...toSourceRows(cfg.medConditionIntelligenceRules, "MED_CONDITION_INTELLIGENCE_RULES"),
  ];
  const redFlagRows = [
    ...toSourceRows(asSheetRows(cfg.redFlagRules, RedFlagRuleGuard), "RED_FLAG_RULES"),
    ...toSourceRows(cfg.redFlagsMaster, "RED_FLAGS_MASTER"),
  ];
  const clusterRows = [
    ...toSourceRows(asSheetRows(cfg.clusterScoringRules, ClusterScoringGuard), "CLUSTER_SCORING_RULES"),
    ...toSourceRows(cfg.scoringSystems, "SCORING_SYSTEMS"),
    ...toSourceRows(asSheetRows(cfg.scoringDefs, ScoringDefGuard), "SCORING_DEFS"),
  ];

  // evaluateRowExpr: uses the full evaluator on the row's expression field.
  // Returns false when no expression field exists (no longer scans ALL row values).
  const matchedModifiers = modifierRows.filter(row => evaluateRowExpr(row as Record<string, any>, tokens)).slice(0, 10);
  const matchedQuestions = questionRows.filter(row => {
    const askIf = getAny(row, ["ASK_IF", "askIf"], "true");
    return evaluateExpr(askIf, tokens);
  }).slice(0, 10);
  const matchedWorkup = workupRows.filter(row => evaluateRowExpr(row as Record<string, any>, tokens)).slice(0, 10);
  const matchedMedication = medicationRows.filter(row => evaluateRowExpr(row as Record<string, any>, tokens)).slice(0, 10);

  const triggeredRedFlags = redFlagRows.filter(row => {
    const expr = getAny(row, ["TRIGGER_EXPR", "triggerExpr", "WHEN_EXPR", "whenExpr", "RULE_EXPR"]);
    return evaluateExpr(expr, tokens);
  }).slice(0, 10);

  const redFlagForcesEscalation = triggeredRedFlags.some(row => {
    const severity = getAny(row, ["SEVERITY", "severity"]).toUpperCase();
    const action = getAny(row, ["ACTION", "action", "IMMEDIATE_ACTIONS", "immediateActions"]).toUpperCase();
    return severity === "HARD" || action.includes("ER") || action.includes("ESCALATE") || action.includes("911");
  });

  const scoredClusters = new Map<string, { clusterId: string; score: number; evidence: any[] }>();
  for (const row of cfg.clusterScoringRules) {
    // evaluateExpr with full boolean+threshold logic — no more fallback scan
    if (!evaluateExpr(row.whenExpr, tokens)) continue;
    const current = scoredClusters.get(row.clusterId) ?? { clusterId: row.clusterId, score: 0, evidence: [] };
    current.score += row.points;
    current.evidence.push({ ruleId: row.ruleId, points: row.points, evidenceLabel: row.evidenceLabel });
    scoredClusters.set(row.clusterId, current);
  }
  const clusterResults = Array.from(scoredClusters.values()).sort((a, b) => b.score - a.score).slice(0, 8);

  const diagnosisBaseRows = buildDiagnosisRankingRows(cfg);
  const diagnosisResults = diagnosisBaseRows
    .map(row => {
      const clusterId = getAny(row, ["BEST_CLUSTER_ID", "CLUSTER_ID", "clusterId"]);
      const clusterScore = clusterId ? scoredClusters.get(clusterId)?.score ?? 0 : 0;
      const baseScore = Number(getAny(row, ["BASE_SCORE", "BASE_POINTS", "POINTS"], "0")) || 0;
      return {
        ...compactRow(row),
        diagnosis: getAny(row, ["DX_LABEL", "diagnosis", "diagnosisLabel", "LABEL"], compactRow(row).label),
        clusterId,
        score: baseScore + clusterScore,
        baseScore,
        clusterScore,
        rank: Number(getAny(row, ["RANK"], "999")) || 999,
      };
    })
    .sort((a, b) => (b.score - a.score) || (a.rank - b.rank))
    .slice(0, 8);

  const dispositionRule = cfg.dispositionRules.find(row => evaluateExpr(row.whenExpr, tokens))
    ?? cfg.dispositionRules.find(row => ["true", "always", "default"].includes(row.whenExpr.toLowerCase()))
    ?? cfg.dispositionRules[0]
    ?? null;

  const template = dispositionRule
    ? cfg.outputTemplates.find(t => t.templateId === dispositionRule.rationaleTemplateId) ?? null
    : null;

  const finalDisposition = redFlagForcesEscalation
    ? "ESCALATE_IMMEDIATELY"
    : dispositionRule?.dispositionLevel ?? "routine";

  return {
    pipeline: [
      {
        step: "1",
        stage: "complaint_identification",
        label: "Step 1 — Complaint Identification",
        triggered: true,
        results: [{ complaintId: cfg.registry.ccId, label: cfg.registry.label, engineType: cfg.registry.engineType, sourceTable: "COMPLAINT_REGISTRY" }],
        allRuleCount: 1,
      },
      {
        step: "2",
        stage: "differential_diagnosis",
        label: "Step 2 — Differential Diagnosis / Rule-Out Targets",
        triggered: earlyDifferentialRows.length > 0,
        results: diagnosisResults.slice(0, 5),
        allRuleCount: earlyDifferentialRows.length,
      },
      {
        step: "3A",
        stage: "modifier_collection",
        label: "Step 3A — Modifier Collection",
        triggered: matchedModifiers.length > 0,
        results: matchedModifiers.map(row => compactRow(row)),
        allRuleCount: modifierRows.length,
      },
      {
        step: "3B",
        stage: "question_engine",
        label: "Step 3B — Question Engine",
        triggered: matchedQuestions.length > 0,
        results: matchedQuestions.map(row => compactRow(row)),
        allRuleCount: questionRows.length,
      },
      {
        step: "4",
        stage: "workup_selection",
        label: "Step 4 — Workup Selection",
        triggered: matchedWorkup.length > 0,
        results: matchedWorkup.map(row => compactRow(row)),
        allRuleCount: workupRows.length,
      },
      {
        step: "5",
        stage: "medication_safety",
        label: "Step 5 — Medication Selection / Safety",
        triggered: matchedMedication.length > 0,
        results: matchedMedication.map(row => compactRow(row)),
        allRuleCount: medicationRows.length,
      },
      {
        step: "6",
        stage: "red_flag_screen",
        label: "Step 6 — Safety Screen (Red Flags)",
        triggered: triggeredRedFlags.length > 0,
        results: triggeredRedFlags.map(row => compactRow(row)),
        allRuleCount: redFlagRows.length,
      },
      {
        step: "7",
        stage: "cluster_scoring",
        label: "Step 7 — Cluster Scoring",
        triggered: clusterResults.length > 0,
        results: clusterResults,
        allRuleCount: clusterRows.length,
      },
      {
        step: "8",
        stage: "diagnosis_ranking",
        label: "Step 8 — Diagnosis Ranking / Differential Refinement",
        triggered: diagnosisResults.length > 0,
        results: diagnosisResults,
        allRuleCount: diagnosisBaseRows.length,
      },
      {
        step: "9",
        stage: "disposition_plan",
        label: "Step 9 — Disposition + Plan",
        triggered: dispositionRule !== null || redFlagForcesEscalation,
        results: [
          {
            ruleId: dispositionRule?.dispRuleId ?? null,
            disposition: finalDisposition,
            priority: dispositionRule?.priority ?? null,
            confidenceHint: dispositionRule?.confidenceHint ?? null,
            planTemplateId: template?.templateId ?? dispositionRule?.rationaleTemplateId ?? null,
            plan: template?.body ?? null,
            forcedByRedFlagGate: redFlagForcesEscalation,
            sourceTables: ["DISPOSITION_RULES", "OUTPUT_TEMPLATES"],
          },
        ],
        allRuleCount: cfg.dispositionRules.length + cfg.outputTemplates.length,
      },
      {
        step: "13",
        stage: "audit_trail",
        label: "Step 13 — Audit Trail",
        triggered: true,
        results: [{ note: "Trace should be recorded via appendAuditEvent when attached to a real encounter or physician action.", sourceTables: ["audit_logs", "appendAuditEvent"] }],
        allRuleCount: 1,
      },
    ],
    finalDisposition,
    isEscalated: redFlagForcesEscalation,
    topDiagnosis: diagnosisResults[0] ?? null,
    activeRuleCount: earlyDifferentialRows.length + modifierRows.length + questionRows.length + workupRows.length + medicationRows.length + redFlagRows.length + clusterRows.length + diagnosisBaseRows.length + cfg.dispositionRules.length + cfg.outputTemplates.length,
  };
}

// ── Full complaint bundle — one call returns all World B layers ───────────────
router.get("/:complaintId/bundle", async (req: Request, res: Response) => {
  const { complaintId } = req.params;
  try {
    const cfg = await loadComplaintConfig(complaintId, { strict: false });
    if (!cfg) return res.status(404).json({ error: "Complaint not found" });

    const layers = buildPipelineLayers(cfg);
    let changes: any[] = [];
    try {
      changes = await db
        .select()
        .from(kbKnowledgeChanges)
        .where(eq(kbKnowledgeChanges.complaintId, cfg.registry.ccId))
        .orderBy(desc(kbKnowledgeChanges.createdAt))
        .limit(20);
    } catch (err) {
      console.warn(`[ClinicalPipeline] change history unavailable for ${cfg.registry.ccId}`, err);
    }

    const totalRules = Object.values(layers).reduce((sum, l) => sum + l.count, 0);

    res.json({
      complaint: {
        complaintId: cfg.registry.ccId,
        label: cfg.registry.label,
        category: cfg.registry.system,
        urgencyLevel: cfg.registry.engineType,
      },
      world: "World B — normalized Google Sheets clinical reasoning layer",
      sourceMap: WORLD_B_PIPELINE_SOURCE_MAP,
      layers,
      changeHistory: changes,
      summary: {
        totalRules,
        hasRedFlags: layers.redFlags.count > 0,
        hasDisposition: layers.dispositionPlan.count > 0,
        hasDiagnosis: layers.differentialDiagnosis.count > 0 || layers.diagnosisRanking.count > 0,
        lastChanged: changes[0]?.createdAt ?? null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Live clinical trace — dashboard trace through World B provenance ──────────
router.post("/:complaintId/trace", async (req: Request, res: Response) => {
  const { complaintId } = req.params;
  const { symptoms = [], freeText = "" } = req.body;

  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: "symptoms must be a non-empty array of strings" });
  }

  try {
    const cfg = await loadComplaintConfig(complaintId, { strict: false });
    if (!cfg) return res.status(404).json({ error: "Complaint not found" });

    const trace = buildTrace(cfg, symptoms.map(String), String(freeText ?? ""));

    res.json({
      ok: true,
      complaintId: cfg.registry.ccId,
      symptoms,
      freeText,
      engineSource: "WORLD_B_GOOGLE_SHEETS",
      sourceMap: WORLD_B_PIPELINE_SOURCE_MAP,
      pipeline: trace.pipeline,
      finalDisposition: trace.finalDisposition,
      isEscalated: trace.isEscalated,
      topDiagnosis: trace.topDiagnosis,
      activeRuleCount: trace.activeRuleCount,
      tracedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── All complaints list (for selector) ─────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = await listAvailableComplaints();
    res.json(rows.map(row => ({
      complaintId: row.ccId,
      label: row.label || row.ccId,
      category: row.system,
      urgencyLevel: row.engineType,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
