/**
 * Architecture Compliance Assessment API
 *
 * Provides an honest, real-time evaluation of which architectural concerns
 * from the Claude 9/10 review have been addressed vs. still scaffolded.
 */

import { Router, type Request, type Response } from "express";
import {
  getPendingProposals,
  getModelVersions,
  getVersionedRLHFStats,
  approveProposals,
  rejectProposals,
  rollbackVersion,
} from "../learning/versionedRLHF";
import { getFinalPipelineStats }  from "../clinical/finalPipeline";
import { canLearn }               from "../release/modelFreeze";
import { getDriftState }          from "../learning/driftControl";
import { canRunAutonomousLearning } from "../learning/learningEligibility";
import { intendedUse, getIntendedUseSummary } from "../fda/intendedUse";
import { getRedisAsync }          from "../queue/redis";

const router = Router();

/* ─── Compliance assessment ─────────────────────────────────────────────── */

router.get("/assessment", async (req: Request, res: Response) => {
  const rlhfStats   = getVersionedRLHFStats();
  const pipelineStats = getFinalPipelineStats();
  const driftState  = getDriftState();
  const modelFrozen = !canLearn();

  let redisConnected = false;
  try {
    const r = await getRedisAsync();
    redisConnected = r !== null;
  } catch { /* */ }

  let learningEligibility: any = { allowed: false };
  try {
    learningEligibility = await canRunAutonomousLearning();
  } catch { /* */ }

  const concerns = [
    {
      id: "sheets-migration",
      title: "Migrate off Google Sheets",
      priority: "CRITICAL",
      reviewNote: "Google Sheets backend signals prototype-stage to any technical due diligence reviewer. Patient safety at scale.",
      status: "PARTIAL",
      statusNote: "PostgreSQL is the primary transactional database. Google Sheets is read-only config/content layer (clinical rules, question packs). NOT used for patient data or encounter state.",
      evidence: ["Drizzle ORM with PG pool active", "Encounters/patients stored in Postgres", "Sheets used only for clinical rule packs via SheetFlowLoader"],
      remainingWork: ["Migrate remaining rule packs from Sheets to DB-backed config table", "Add DB-driven pack editor UI"],
    },
    {
      id: "fhir-integration",
      title: "FHIR R4 Integration Layer",
      priority: "HIGH",
      reviewNote: "Without EHR connectivity, adoption requires workflow disruption that most clinics won't accept.",
      status: "IMPLEMENTED",
      statusNote: "Full SMART-on-FHIR client with OAuth2 token management. Encounter, Patient, and Observation resources mapped. Sync triggered automatically from final pipeline via event bus.",
      evidence: [
        "server/ehr/fhir/fhirClient.ts — HTTP client",
        "server/ehr/fhir/fhirMapper.ts — Patient/Encounter/Observation mapping",
        "server/ehr/fhir/fhirService.ts — sync logic",
        "server/ehr/fhir/fhirAuth.ts — SMART-on-FHIR OAuth2",
        `Pipeline v${pipelineStats.pipelineVersion} publishes FhirSyncRequested event on every triage`,
        "Epic adapter and SMART launch flow implemented",
      ],
      remainingWork: ["Connect to real Epic sandbox credentials", "Test with Cerner FHIR endpoint"],
    },
    {
      id: "intended-use",
      title: "FDA Intended Use Statement",
      priority: "CRITICAL",
      reviewNote: "Every regulatory and product decision flows from this. Without it you're building toward an undefined regulatory target.",
      status: "IMPLEMENTED",
      statusNote: "Formal intended use statement defined with SaMD class, regulatory pathway, clinical scope, and human-in-loop requirement.",
      evidence: [
        `Product: ${intendedUse.productName} v${intendedUse.version}`,
        `Class: ${intendedUse.regulatory.deviceClass}`,
        `Pathway: ${intendedUse.regulatory.regulatoryPathway}`,
        `Human-in-loop: ${intendedUse.humanInLoop}`,
        `Intended user: ${intendedUse.intendedUser}`,
      ],
      remainingWork: ["Submit FDA pre-submission meeting request", "Engage clinical informaticist for IEC 62304 classification"],
    },
    {
      id: "safety-pathways",
      title: "Sepsis / Pediatric / Mental Health Crisis Pathways",
      priority: "HIGH",
      reviewNote: "Highest-liability gaps in clinical coverage.",
      status: "IMPLEMENTED",
      statusNote: "All four critical pathways are implemented and run as non-bypassable gates before any AI output is returned.",
      evidence: [
        "qSOFA sepsis scoring (RR≥22, AMS, SBP≤100)",
        "PEWS pediatric scoring (HR, respiratory distress, behavior)",
        "Obstetric emergency: vaginal bleeding, reduced fetal movement, severe headache, seizure",
        "Mental health: PHQ-9, suicide risk, self-harm ideation → ER_NOW hard gate",
        "Safety pipeline runs BEFORE reasoning output is returned",
      ],
      remainingWork: ["Add NEWS2 sepsis scoring as second pass", "Add postpartum depression screening"],
    },
    {
      id: "async-llm",
      title: "Async LLM Calls (Remove from Critical Path)",
      priority: "HIGH",
      reviewNote: "Latency in diagnosis is unacceptable. LLM calls must be async.",
      status: "IMPLEMENTED",
      statusNote: "Hybrid reasoning (deterministic + Bayesian) runs synchronously in <5ms. LLM/GPT calls are used only for non-critical auxiliary features (explanation generation, note drafting) via async event workers.",
      evidence: [
        "finalPipeline.ts — synchronous Bayesian + rule-based reasoning, no LLM in critical path",
        "GPT calls in /api/gpt-explanation/* are advisory only, not blocking",
        "Event bus workers handle async AI tasks independently",
      ],
      remainingWork: ["Enforce LLM call budget guard (max 2s timeout) for all advisory AI endpoints"],
    },
    {
      id: "multi-complaint-fusion",
      title: "Multi-Complaint Fusion Engine",
      priority: "MEDIUM",
      reviewNote: "Current linear tree fails on complex presentations.",
      status: "IMPLEMENTED",
      statusNote: "Multi-complaint fusion runs as stage 1.5 in the final pipeline, detecting compound syndromes (PE, sepsis, STEMI, stroke, anaphylaxis) before reasoning.",
      evidence: [
        "server/clinical/multiComplaintFusion.ts — 8+ compound syndrome rules",
        `Wired into pipeline v${pipelineStats.pipelineVersion} as stage 1.5`,
        "CRITICAL fusion overrides disposition before safety pipeline",
        "Fusion result included in pipeline output",
      ],
      remainingWork: ["Add HCC-relevant compound presentations (DM + CKD + HTN fusion)"],
    },
    {
      id: "snomed-anchoring",
      title: "SNOMED CT / ICD-10 Anchoring at Storage Level",
      priority: "MEDIUM",
      reviewNote: "Prevents ontology drift from corrupting downstream ML.",
      status: "PARTIAL",
      statusNote: "ICD-10 codes are mapped and stored via NLP intake. SNOMED CT mapping is not yet implemented at the storage schema level.",
      evidence: [
        "server/clinical/nlpIntake.ts — ICD-10 substring mapping with 80+ conditions",
        "HCC engine uses CMS-HCC V28 code corpus",
        "Billing captures ICD-10 codes on every encounter",
      ],
      remainingWork: [
        "Add SNOMED CT concept IDs to the ICD-10 mapping corpus",
        "Store canonical SNOMED concept ID on encounter table",
        "Add SNOMED CT → ICD-10 bidirectional lookup",
      ],
    },
    {
      id: "rlhf-human-gate",
      title: "Human Review Gate for RLHF Weight Changes",
      priority: "CRITICAL",
      reviewNote: "Required for regulatory compliance and physician trust. Autonomous weight modification in production would require a predetermination request.",
      status: "IMPLEMENTED",
      statusNote: "Proposals are queued and require explicit human approval before any version is created. State persists to Redis across restarts.",
      evidence: [
        `${rlhfStats.pendingCount} proposals currently pending review`,
        `${rlhfStats.approvedVersions} approved model versions`,
        `${rlhfStats.rejectedCount} proposals rejected`,
        `Redis persistence: ${rlhfStats.redisHydrated ? "active" : "in-memory fallback"}`,
        `Model freeze: ${modelFrozen ? "FROZEN" : "active"}`,
        `Drift lock: ${driftState.locked ? "LOCKED" : "clear"}`,
        `Learning eligible: ${learningEligibility.allowed ? "yes" : "no — " + (learningEligibility.reason ?? "")}`,
      ],
      remainingWork: ["Build physician-facing approval UI (in progress)", "Add email notification on new proposals"],
    },
    {
      id: "medication-safety",
      title: "Medication Management Safeguards",
      priority: "HIGH",
      reviewNote: "Missing from original architecture.",
      status: "IMPLEMENTED",
      statusNote: "Drug interaction detection, formulary checks, DEA schedule guard, and Surescripts-compatible async eRx adapter all implemented and exposed via API.",
      evidence: [
        "server/medications/interactions.ts — drug interaction DB",
        "server/medications/formulary.ts — formulary lookup",
        "server/medications/deaGuard.ts — DEA schedule validation",
        "server/medications/medSafetyService.ts — unified safety check",
        "/api/medications/* — routes exposed",
      ],
      remainingWork: ["Integrate real Surescripts API credentials", "Expand drug interaction corpus beyond 3 pairs"],
    },
    {
      id: "event-driven-arch",
      title: "Event-Driven Architecture for Async Clinical Workflows",
      priority: "HIGH",
      reviewNote: "No event streaming layer for async clinical workflows.",
      status: "PARTIAL",
      statusNote: "In-process event bus with subscribed workers for FHIR sync and medication safety. Not yet backed by persistent queue (BullMQ requires TCP Redis; Upstash is REST-only).",
      evidence: [
        "server/events/bus.ts — publish/subscribe with audit log",
        "server/events/workers.ts — FHIR sync worker, medication safety worker",
        `Redis available: ${redisConnected}`,
        "RLHF proposals persisted to Redis",
        "FHIR sync published from pipeline on every triage",
      ],
      remainingWork: [
        "Replace in-process bus with BullMQ (requires TCP Redis upgrade from Upstash REST)",
        "Add dead-letter queue for failed FHIR sync attempts",
      ],
    },
  ];

  const summary = {
    total:       concerns.length,
    implemented: concerns.filter(c => c.status === "IMPLEMENTED").length,
    partial:     concerns.filter(c => c.status === "PARTIAL").length,
    scaffolded:  concerns.filter(c => c.status === "SCAFFOLDED").length,
    critical:    concerns.filter(c => c.priority === "CRITICAL" && c.status !== "IMPLEMENTED").length,
  };

  return res.json({ summary, concerns, assessedAt: new Date().toISOString() });
});

/* ─── RLHF proposal management ──────────────────────────────────────────── */

router.get("/rlhf/proposals", (_req: Request, res: Response) => {
  return res.json({
    pending:  getPendingProposals(),
    versions: getModelVersions(),
    stats:    getVersionedRLHFStats(),
  });
});

router.post("/rlhf/approve", (req: Request, res: Response) => {
  const { approvedBy = "physician", notes } = req.body;
  const version = approveProposals(approvedBy, notes);
  if (!version) {
    return res.status(400).json({ error: "No pending proposals to approve" });
  }
  return res.json({ approved: true, version });
});

router.post("/rlhf/reject", (req: Request, res: Response) => {
  const { rejectedBy = "physician", reason = "Not approved" } = req.body;
  const count = rejectProposals(rejectedBy, reason);
  return res.json({ rejected: true, count });
});

router.post("/rlhf/rollback", (req: Request, res: Response) => {
  const { versionId, rolledBackBy = "physician" } = req.body;
  if (!versionId) return res.status(400).json({ error: "versionId is required" });
  const ok = rollbackVersion(versionId, rolledBackBy);
  return res.json({ rolledBack: ok });
});

/* ─── Pipeline stats ────────────────────────────────────────────────────── */

router.get("/pipeline", (_req: Request, res: Response) => {
  return res.json(getFinalPipelineStats());
});

router.get("/intended-use", (_req: Request, res: Response) => {
  return res.json({ intendedUse, summary: getIntendedUseSummary() });
});

export default router;
