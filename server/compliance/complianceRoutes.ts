/**
 * COMPLIANCE ROUTES — All 7-Domain Claude Recommendations
 *
 * Mounts all compliance, safety, audit, and learning endpoints under
 * /api/compliance/* and /api/phase7/* namespaces.
 *
 * Domain coverage:
 *   D1 Safety:       /api/compliance/safety/*
 *   D2 FDA/HIPAA:    /api/compliance/physician-checkpoint/*
 *                    /api/compliance/policy-proposals/*
 *                    /api/compliance/breach-register
 *                    /api/compliance/audit-verify
 *   D3 Observability:/api/compliance/slos
 *                    /api/compliance/engine-health
 *   D4 Architecture: /api/compliance/agent-config (Redis persistence)
 *   D5 Learning:     /api/compliance/demographic-parity
 *   D6 Debate:       (wired into debate engine — no separate endpoint)
 *   D7 Packs:        /api/compliance/packs
 *   Phase 7 Health:  /api/phase7/health
 */

import { Router, Request, Response } from "express";
import { evaluateHardStops }          from "../safety/hardStopRules";
import { evaluatePediatricSafety }    from "../safety/pediatricSafetyRules";
import { assessVitalSigns }           from "../safety/vitalSignsThresholds";
import { runIndependentSafetyEvaluation } from "../safety/independentSafetyPath";

import {
  createPhysicianApprovalRequest,
  recordPhysicianDecision,
  getPendingApprovals,
  getApprovalRecord,
  requiresPhysicianApproval,
  DISPOSITIONS_REQUIRING_APPROVAL,
  REVIEW_TIMEOUT_MINUTES,
} from "./physicianCheckpoint";

import {
  proposePolicy,
  approvePolicy,
  rejectPolicy,
  getPendingProposals,
  getAllProposals,
} from "./policyProposalGate";

import { getBreachRiskRegister, updateMitigationStatus } from "./hipaaBreachRegister";
import { verifyFullAuditChain, verifyAuditBatch }        from "../audit/auditVerifier";
import { getSLOStatuses, recordSLOValue }                 from "../observability/clinicalSLOs";
import { getAllEngineHealthMetrics }                      from "../observability/engineHealthWrapper";
import { computeParityAnalysis, getGroupDispositionCounts, recordDispositionForGroup } from "../learning/demographicDriftMonitor";
import { getSafeDriftState, resetSafeDriftCircuit, evaluateDrift } from "../learning/safeDriftCircuitBreaker";
import { getPhase7Health }                                from "../phase7/phase7Health";
import { getAllPackSummaries, validateClinicalPack }      from "./clinicalPackSchema";
import { handleConsensus }                                from "../phase9/debate/consensusFailureHandler";
import { runRedTeamAgent }                                from "../phase9/debate/redTeamAgent";
import { DispositionTier }                                from "../safety/hardStopRules";

const router = Router();

// ─── DOMAIN 1: Safety ─────────────────────────────────────────────────────────

/**
 * POST /api/compliance/safety/evaluate
 * Run independent safety evaluation (hard stops + pediatric + vital signs)
 */
router.post("/safety/evaluate", async (req: Request, res: Response) => {
  try {
    const { rawText, symptoms = [], ageMonths, temperature, heartRate, respiratoryRate, o2Sat, llmDisposition } = req.body;
    if (!rawText) return res.status(400).json({ error: "rawText is required" });

    const safetyVerdict = await runIndependentSafetyEvaluation({
      rawPatientText:           rawText,
      extractedSymptoms:        symptoms,
      llmDerivedRedFlags:       [],
      llmSuggestedDisposition:  llmDisposition,
      ageMonths,
      temperatureC:             temperature,
      respiratoryRate,
      heartRate,
      o2Saturation:             o2Sat,
    });

    const vitalAssessment = (heartRate || respiratoryRate || o2Sat || temperature)
      ? assessVitalSigns({ heartRate, respiratoryRate, o2Saturation: o2Sat, temperatureC: temperature, ageYears: ageMonths ? ageMonths / 12 : undefined })
      : null;

    return res.json({ safetyVerdict, vitalAssessment });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

/**
 * POST /api/compliance/safety/hard-stops
 * Check raw text against absolute hard-stop rules
 */
router.post("/safety/hard-stops", (req: Request, res: Response) => {
  const { rawText, symptoms = [], ageMonths } = req.body;
  if (!rawText) return res.status(400).json({ error: "rawText is required" });
  const result = evaluateHardStops(rawText, symptoms, ageMonths);
  return res.json(result);
});

/**
 * POST /api/compliance/safety/pediatric
 * Age-stratified pediatric safety check
 */
router.post("/safety/pediatric", (req: Request, res: Response) => {
  const { ageMonths, temperatureC, respiratoryRate, heartRate, o2Saturation } = req.body;
  if (ageMonths === undefined) return res.status(400).json({ error: "ageMonths is required" });
  const result = evaluatePediatricSafety({ ageMonths, temperatureC, respiratoryRate, heartRate, o2Saturation });
  return res.json(result);
});

/**
 * POST /api/compliance/safety/red-team
 * Run adversarial Red Team Agent against a consensus result
 */
router.post("/safety/red-team", async (req: Request, res: Response) => {
  try {
    const { consensusDisposition, consensusConfidence, agentOpinions = [], rawText = "", symptoms = [], complaint = "" } = req.body;
    if (!consensusDisposition) return res.status(400).json({ error: "consensusDisposition is required" });
    const verdict = await runRedTeamAgent({
      consensusDisposition,
      consensusConfidence: consensusConfidence ?? 0.75,
      agentOpinions,
      rawPatientText: rawText,
      extractedSymptoms: symptoms,
      complaint,
    });
    return res.json(verdict);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

// ─── DOMAIN 2: Physician Checkpoints ─────────────────────────────────────────

/**
 * GET /api/compliance/physician-checkpoint/config
 */
router.get("/physician-checkpoint/config", (_req: Request, res: Response) => {
  return res.json({
    dispositionsRequiringApproval: DISPOSITIONS_REQUIRING_APPROVAL,
    reviewTimeoutMinutes:          REVIEW_TIMEOUT_MINUTES,
    timeoutBehavior:               "escalate_disposition",
  });
});

/**
 * GET /api/compliance/physician-checkpoint/pending
 */
router.get("/physician-checkpoint/pending", (_req: Request, res: Response) => {
  return res.json({ pending: getPendingApprovals() });
});

/**
 * POST /api/compliance/physician-checkpoint/request
 * Create a physician approval request for a disposition
 */
router.post("/physician-checkpoint/request", async (req: Request, res: Response) => {
  try {
    const { caseId, disposition, modelVersion = "unknown", agentWeights = {}, confidenceScore = 0, redFlagsEvaluated = [] } = req.body;
    if (!caseId || !disposition) return res.status(400).json({ error: "caseId and disposition are required" });
    if (!requiresPhysicianApproval(disposition)) {
      return res.json({ approvalRequired: false, disposition, message: `${disposition} does not require physician pre-approval` });
    }
    const record = await createPhysicianApprovalRequest({ caseId, disposition, modelVersion, agentWeights, confidenceScore, redFlagsEvaluated });
    return res.status(201).json({ approvalRequired: true, record });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

/**
 * POST /api/compliance/physician-checkpoint/:approvalId/decide
 */
router.post("/physician-checkpoint/:approvalId/decide", async (req: Request, res: Response) => {
  try {
    const { approvalId } = req.params;
    const { physicianId, decision, overrideDisposition, overrideReason } = req.body;
    if (!physicianId || !decision) return res.status(400).json({ error: "physicianId and decision are required" });
    const record = await recordPhysicianDecision({ approvalId, physicianId, decision, overrideDisposition, overrideReason });
    if (!record) return res.status(404).json({ error: "approval record not found" });
    return res.json({ record });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

/**
 * GET /api/compliance/physician-checkpoint/:approvalId
 */
router.get("/physician-checkpoint/:approvalId", (req: Request, res: Response) => {
  const record = getApprovalRecord(req.params.approvalId);
  if (!record) return res.status(404).json({ error: "not found" });
  return res.json({ record });
});

// ─── DOMAIN 2: Policy Proposal Gate ──────────────────────────────────────────

router.get("/policy-proposals", (_req: Request, res: Response) => {
  return res.json({ proposals: getAllProposals() });
});

router.get("/policy-proposals/pending", (_req: Request, res: Response) => {
  return res.json({ pending: getPendingProposals() });
});

router.post("/policy-proposals/propose", async (req: Request, res: Response) => {
  try {
    const { candidateMode, currentMode, supportingMetrics = {}, proposedBy = "system" } = req.body;
    if (!candidateMode || !currentMode) return res.status(400).json({ error: "candidateMode and currentMode are required" });
    const result = await proposePolicy({ candidateMode, currentMode, supportingMetrics, proposedBy });
    if ("error" in result) return res.status(409).json(result);
    return res.status(201).json({ proposal: result });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

router.post("/policy-proposals/:proposalId/approve", async (req: Request, res: Response) => {
  try {
    const { approvingPhysicianId, approvalNotes = "" } = req.body;
    const result = await approvePolicy({ proposalId: req.params.proposalId, approvingPhysicianId, approvalNotes });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

router.post("/policy-proposals/:proposalId/reject", async (req: Request, res: Response) => {
  try {
    const { physicianId, rejectionReason } = req.body;
    const result = await rejectPolicy({ proposalId: req.params.proposalId, physicianId, rejectionReason });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

// ─── DOMAIN 2: HIPAA Breach Register ─────────────────────────────────────────

router.get("/breach-register", (_req: Request, res: Response) => {
  return res.json(getBreachRiskRegister());
});

router.patch("/breach-register/:id/mitigation", (req: Request, res: Response) => {
  const { status, notes } = req.body;
  const ok = updateMitigationStatus(req.params.id, status, notes);
  if (!ok) return res.status(404).json({ error: "risk entry not found" });
  return res.json({ success: true });
});

// ─── DOMAIN 2: Audit Verification ────────────────────────────────────────────

router.get("/audit-verify", async (_req: Request, res: Response) => {
  try {
    const result = await verifyFullAuditChain();
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

router.get("/audit-verify/batch", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await verifyAuditBatch(limit);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

// ─── DOMAIN 3: Clinical SLOs ──────────────────────────────────────────────────

router.get("/slos", (_req: Request, res: Response) => {
  return res.json({ slos: getSLOStatuses() });
});

router.post("/slos/:sloId/record", (req: Request, res: Response) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: "value is required" });
  recordSLOValue(req.params.sloId, value);
  return res.json({ success: true });
});

// ─── DOMAIN 3: Engine Health ──────────────────────────────────────────────────

router.get("/engine-health", (_req: Request, res: Response) => {
  const metrics = getAllEngineHealthMetrics();
  const summary = {
    total:           metrics.length,
    circuitOpen:     metrics.filter(m => m.circuitBreakerOpen).length,
    highErrorRate:   metrics.filter(m => m.errorRate24h > 0.10).length,
    invocationsLast24h: metrics.reduce((a, m) => a + m.invocationCount24h, 0),
  };
  return res.json({ summary, engines: metrics });
});

// ─── DOMAIN 5: Demographic Parity ────────────────────────────────────────────

router.get("/demographic-parity", (_req: Request, res: Response) => {
  const analysis = computeParityAnalysis();
  const counts   = getGroupDispositionCounts();
  return res.json({ analysis, groupCounts: counts });
});

router.post("/demographic-parity/record", (req: Request, res: Response) => {
  const { groups = [], disposition } = req.body;
  if (!disposition) return res.status(400).json({ error: "disposition is required" });
  recordDispositionForGroup(groups, disposition);
  return res.json({ success: true });
});

// ─── DOMAIN 5: Drift Circuit Breaker ─────────────────────────────────────────

router.get("/drift-circuit", (_req: Request, res: Response) => {
  return res.json(getSafeDriftState());
});

router.post("/drift-circuit/evaluate", async (req: Request, res: Response) => {
  try {
    const { performanceDelta = 0, erNowFalseNegRate, demographicParityDelta, caseVolume24h } = req.body;
    const decision = await evaluateDrift({ performanceDelta, erNowFalseNegRate, demographicParityDelta, caseVolume24h });
    return res.json(decision);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

router.post("/drift-circuit/reset", (_req: Request, res: Response) => {
  resetSafeDriftCircuit();
  return res.json({ success: true, message: "Safe drift circuit breaker reset to CLOSED" });
});

// ─── DOMAIN 6: Consensus Failure ─────────────────────────────────────────────

router.post("/consensus/evaluate", (req: Request, res: Response) => {
  try {
    const { disposition, confidence, agentAgreementType, redFlagsAddressed = [], rawText = "", extractedSymptoms = [], patientContext } = req.body;
    if (!disposition || confidence === undefined) return res.status(400).json({ error: "disposition and confidence are required" });
    const result = handleConsensus({ disposition, confidence, agentAgreementType: agentAgreementType ?? "unanimous", redFlagsAddressed, rawText, extractedSymptoms, patientContext });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

// ─── DOMAIN 7: Clinical Packs ─────────────────────────────────────────────────

router.get("/packs", (_req: Request, res: Response) => {
  return res.json({ packs: getAllPackSummaries() });
});

router.post("/packs/validate", (req: Request, res: Response) => {
  try {
    const result = validateClinicalPack(req.body);
    return res.json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message });
  }
});

// ─── Phase 7 Health ───────────────────────────────────────────────────────────

router.get("/phase7-health", async (_req: Request, res: Response) => {
  try {
    const health = await getPhase7Health();
    const statusCode = health.status === "critical" ? 503 : health.status === "degraded" ? 200 : 200;
    return res.status(statusCode).json(health);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

export default router;
