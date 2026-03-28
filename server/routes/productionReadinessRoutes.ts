import { Router, Request, Response } from "express";
import { isFhirConfigured } from "../ehr/fhir/fhirClient";
import { isSmartAuthConfigured } from "../ehr/fhir/fhirAuth";
import { isSmartLaunchConfigured } from "../ehr/fhir/smartLaunch";
import { isEpicAdapterConfigured } from "../ehr/fhir/epicAdapter";
import { getBusStats, getRecentEvents } from "../events/bus";
import { canRunAutonomousLearning, upsertLabeledStats } from "../learning/learningEligibility";
import { getInteractionDb } from "../medications/interactions";
import { validatePrescriptionAuthority } from "../medications/deaGuard";
import { runMedicationSafetyCheck } from "../medications/medSafetyService";
import { isSyncEnabled } from "../migration/sheetsSyncAdapter";
import { getAuditLogStats } from "../ops/auditEvents";
import { getErxProvider } from "../medications/erxReal";
import { listSupportedPayers } from "../billing/payerRules";
import { getSecureAuditStats } from "../ops/secureAudit";
import { getStatus as getModelFreezeStatus, canLearn } from "../release/modelFreeze";
import { PRIORS_COUNT } from "../clinical/bayesianEngine";
import { getIntendedUseSummary } from "../fda/intendedUse";
import { getQueueStats } from "../learning/reviewQueue";

const router = Router();

// ─── GET /api/production/status ──────────────────────────────────────────────
router.get("/status", async (_req: Request, res: Response) => {
  const [eligibility, busStats] = await Promise.all([
    canRunAutonomousLearning(),
    Promise.resolve(getBusStats()),
  ]);

  const auditStats = getAuditLogStats();

  res.json({
    ok: true,
    layers: {
      fhirR4:          { configured: isFhirConfigured(),  smartAuth: isSmartAuthConfigured(), label: "FHIR R4 Interoperability" },
      eventBus:        { active: true, topics: busStats.subscribedTopics, label: "Clinical Event Bus" },
      medications:     { active: true, interactions: getInteractionDb().length, label: "Medication Safety Engine" },
      rlhfGating:      { ...eligibility, label: "RLHF Learning Gate" },
      sheetsSync:      { enabled: isSyncEnabled(), label: "Sheets→Postgres Sync" },
      repos:           { active: true, tables: ["clinic_patients", "clinic_encounters", "clinic_intake_sessions", "labeled_outcome_stats"], label: "Production Repos" },
      rowLevelSecurity:{ active: true, tables: 3, policies: 3, label: "Row-Level Security (RLS)" },
      claimScrubber:   { active: true, priorAuthCpts: 6, label: "Claim Scrubber + Prior Auth" },
      multiComplaintFusion: { active: true, rules: 8, label: "Multi-Complaint Fusion Engine" },
      surescripts:     { enabled: process.env.SURESCRIPTS_ENABLED === "true", label: "Surescripts eRx Adapter" },
      immutableAudit:  { active: true, totalRecords: auditStats.total, fileSizeBytes: auditStats.fileSizeBytes, label: "Immutable Audit Pipeline" },
      // ── Depth & Maturity Layer (8 new) ──────────────────────────────────────
      smartLaunchFlow:      { active: isSmartLaunchConfigured(), configured: isSmartLaunchConfigured(), label: "SMART on FHIR Launch Flow" },
      epicAdapter:          { active: isEpicAdapterConfigured(), configured: isEpicAdapterConfigured(), label: "Epic Sandbox Adapter" },
      erxReal:              { active: true, provider: getErxProvider(), label: "Real eRx Connector" },
      hccEngine:            { active: true, icdMappings: 20, label: "HCC Coding Engine" },
      payerRules:           { active: true, payers: listSupportedPayers().length, label: "Payer-Specific Rules" },
      bayesianDifferential: { active: true, diagnoses: PRIORS_COUNT, label: "Bayesian Differential Engine" },
      secureAudit:          { active: true, ...getSecureAuditStats(), label: "Cryptographic Audit Log" },
      modelFreeze:          { ...getModelFreezeStatus(), canLearn: canLearn(), label: "Model Freeze + Version Lock" },
      studyPipeline:        { active: true, passThreshold: 0.85, label: "Validation Study Pipeline" },
      // ── Clinical Safety Remediation Layer (8 new) ───────────────────────────
      conflictResolver:     { active: true, strategies: 4, label: "Hybrid Engine Conflict Resolver" },
      sepsisDetection:      { active: true, tools: ["qSOFA", "NEWS2"], label: "Sepsis Detection (qSOFA + NEWS2)" },
      pediatricSafety:      { active: true, tool: "PEWS", label: "Pediatric Safety (PEWS)" },
      obstetricSafety:      { active: true, pathways: 4, label: "Obstetric Emergency Pathways" },
      mentalHealthCrisis:   { active: true, tools: ["PHQ-9", "C-SSRS"], label: "Mental Health Crisis (PHQ-9 + C-SSRS)" },
      fdaIntendedUse:       { active: true, ...getIntendedUseSummary(), label: "FDA Intended Use Statement" },
      rlhfReviewQueue:      { active: true, ...getQueueStats(), label: "RLHF Human-Gated Review Queue" },
      masterSafetyPipeline: { active: true, stages: 5, label: "Master Safety Pipeline" },
    },
    ts: new Date().toISOString(),
  });
});

// ─── GET /api/production/event-bus ───────────────────────────────────────────
router.get("/event-bus", (_req: Request, res: Response) => {
  const stats  = getBusStats();
  const recent = getRecentEvents(20);
  res.json({ ok: true, stats, recent });
});

// ─── GET /api/production/learning-eligibility ────────────────────────────────
router.get("/learning-eligibility", async (_req: Request, res: Response) => {
  const result = await canRunAutonomousLearning();
  res.json({ ok: true, ...result });
});

// ─── POST /api/production/learning-eligibility/seed ──────────────────────────
router.post("/learning-eligibility/seed", async (req: Request, res: Response) => {
  const { totalLabeledEncounters, totalGoldenCases } = req.body;
  const row = await upsertLabeledStats({ totalLabeledEncounters, totalGoldenCases });
  const eligibility = await canRunAutonomousLearning();
  res.json({ ok: true, stats: row, eligibility });
});

// ─── GET /api/production/fhir/status ─────────────────────────────────────────
router.get("/fhir/status", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    configured: isFhirConfigured(),
    baseUrl: process.env.FHIR_BASE_URL || null,
    vendor: "R4",
    resources: ["Patient", "Encounter", "Observation"],
    message: isFhirConfigured()
      ? "FHIR R4 endpoint configured and ready"
      : "Set FHIR_BASE_URL to enable FHIR R4 sync",
  });
});

// ─── POST /api/production/med-safety ─────────────────────────────────────────
router.post("/med-safety", async (req: Request, res: Response) => {
  const { currentMeds = [], proposedDrug, clinicianHasDea = false, state = "NY", patientAge } = req.body;
  if (!proposedDrug) return res.status(400).json({ error: "proposedDrug required" });

  const result = await runMedicationSafetyCheck({
    clinicId: "demo",
    payerId:  "default",
    currentMeds,
    proposedDrug,
    clinicianHasDea,
    state,
    patientAge,
  });

  res.json({ ok: true, ...result });
});

// ─── GET /api/production/interactions ────────────────────────────────────────
router.get("/interactions", (_req: Request, res: Response) => {
  res.json({ ok: true, count: getInteractionDb().length, interactions: getInteractionDb() });
});

// ─── GET /api/production/dea-check ───────────────────────────────────────────
router.post("/dea-check", (req: Request, res: Response) => {
  const { drug, clinicianHasDea = false, state = "NY", patientAge } = req.body;
  if (!drug) return res.status(400).json({ error: "drug required" });
  const result = validatePrescriptionAuthority({ drug, clinicianHasDea, state, patientAge });
  res.json({ ok: true, drug, ...result });
});

export default router;
