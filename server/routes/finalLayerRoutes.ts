import { Router } from "express";
import { runFinalPipeline, getFinalPipelineStats } from "../clinical/finalPipeline";
import { normalizeChiefComplaint, structuredIntake, getNLPIntakeStats } from "../clinical/nlpIntake";
import {
  proposeWeightUpdate, approveProposals, rejectProposals, rollbackVersion,
  getPendingProposals, getModelVersions, getVersionedRLHFStats,
} from "../learning/versionedRLHF";
import { FDA_PROFILE, runComplianceCheck, getFullComplianceReport, getComplianceStats } from "../fda/compliance";
import { runProspectiveStudy, getStudyHistory, getProspectiveStudyStats } from "../fda/prospectiveStudy";
import { analyzeBias, runDemoBiasAnalysis, getBiasAnalysisStats } from "../fda/biasAnalysis";
import { logSecurityEvent, getSecurityEvents, getSecurityStats } from "../ops/security";
import {
  trackPhysicianInteraction, getInteractionHistory, getActionSummary, getHumanFactorsStats,
} from "../clinical/humanFactors";

const router = Router();

/* ── NLP INTAKE ─────────────────────────────────────────────────── */
router.post("/nlp/normalize", (req, res) => {
  const { text } = req.body;
  if (!text) { res.status(400).json({ error: "text required" }); return; }
  res.json(normalizeChiefComplaint(text));
});

router.post("/nlp/intake", (req, res) => {
  if (!req.body?.freeText && !req.body?.complaint) {
    res.status(400).json({ error: "freeText or complaint required" }); return;
  }
  res.json(structuredIntake(req.body));
});

router.get("/nlp/stats", (_req, res) => res.json(getNLPIntakeStats()));

router.get("/nlp/demo", (_req, res) => {
  const examples = [
    "sore throat with fever",
    "chest pain and shortness of breath",
    "ear pain in right ear",
    "runny nose and fatigue",
  ].map((t) => structuredIntake({ freeText: t, symptoms: [t] }));
  res.json({ examples });
});

/* ── VERSIONED RLHF ──────────────────────────────────────────────── */
router.post("/rlhf/propose", (req, res) => {
  const { diagnosisKey, delta, rationale, proposedBy, outcome } = req.body;
  if (!diagnosisKey || delta === undefined || !rationale || !proposedBy) {
    res.status(400).json({ error: "diagnosisKey, delta, rationale, proposedBy required" }); return;
  }
  res.json(proposeWeightUpdate({ diagnosisKey, delta, rationale, proposedBy, outcome }));
});

router.post("/rlhf/approve", (req, res) => {
  const { approvedBy, notes } = req.body;
  if (!approvedBy) { res.status(400).json({ error: "approvedBy required" }); return; }
  const version = approveProposals(approvedBy, notes);
  if (!version) { res.status(400).json({ error: "no pending proposals" }); return; }
  res.json(version);
});

router.post("/rlhf/reject", (req, res) => {
  const { rejectedBy, reason } = req.body;
  if (!rejectedBy || !reason) { res.status(400).json({ error: "rejectedBy, reason required" }); return; }
  const count = rejectProposals(rejectedBy, reason);
  res.json({ rejected: count });
});

router.post("/rlhf/rollback/:versionId", (req, res) => {
  const { rolledBackBy } = req.body;
  if (!rolledBackBy) { res.status(400).json({ error: "rolledBackBy required" }); return; }
  const ok = rollbackVersion(req.params.versionId, rolledBackBy);
  res.json({ success: ok });
});

router.get("/rlhf/pending",   (_req, res) => res.json(getPendingProposals()));
router.get("/rlhf/versions",  (_req, res) => res.json(getModelVersions()));
router.get("/rlhf/stats",     (_req, res) => res.json(getVersionedRLHFStats()));

router.post("/rlhf/demo", (_req, res) => {
  const p1 = proposeWeightUpdate({ diagnosisKey: "strep_throat", delta: 0.02, rationale: "5 confirmed cases", proposedBy: "physician_001", outcome: "confirmed" });
  const p2 = proposeWeightUpdate({ diagnosisKey: "flu", delta: -0.01, rationale: "2 misdiagnoses observed", proposedBy: "physician_002", outcome: "overridden" });
  const version = approveProposals("medical_director_001", "Weekly RLHF review cycle");
  res.json({ proposals: [p1, p2], version });
});

/* ── FDA COMPLIANCE ──────────────────────────────────────────────── */
router.get("/fda/compliance",         (_req, res) => res.json(FDA_PROFILE));
router.get("/fda/compliance/check",   (_req, res) => res.json(runComplianceCheck()));
router.get("/fda/compliance/report",  (_req, res) => res.json(getFullComplianceReport()));
router.get("/fda/compliance/stats",   (_req, res) => res.json(getComplianceStats()));

/* ── PROSPECTIVE STUDY ───────────────────────────────────────────── */
router.post("/study/run", async (req, res) => {
  const { cases } = req.body;
  if (!Array.isArray(cases) || cases.length === 0) {
    res.status(400).json({ error: "cases array required" }); return;
  }
  const stub = async (input: any) => ({
    topDiagnosis: input.expectedDiagnosis ?? "J02.0",
    confidence: 0.85,
  });
  const report = await runProspectiveStudy(cases, stub);
  res.json(report);
});

router.get("/study/history", (_req, res) => res.json(getStudyHistory()));
router.get("/study/stats",   (_req, res) => res.json(getProspectiveStudyStats()));

router.post("/study/demo", async (_req, res) => {
  const demoCases = [
    { caseId: "PST-001", input: { complaint: "sore throat", demographic: "white", ageGroup: "adult", expectedDiagnosis: "J02.0" }, actualOutcome: { diagnosis: "J02.0" } },
    { caseId: "PST-002", input: { complaint: "chest pain", demographic: "hispanic", ageGroup: "adult", expectedDiagnosis: "J02.0" }, actualOutcome: { diagnosis: "R07.9" } },
    { caseId: "PST-003", input: { complaint: "ear pain", demographic: "black", ageGroup: "pediatric", expectedDiagnosis: "H66.90" }, actualOutcome: { diagnosis: "H66.90" } },
    { caseId: "PST-004", input: { complaint: "runny nose", demographic: "asian", ageGroup: "adult", expectedDiagnosis: "J00" }, actualOutcome: { diagnosis: "J00" } },
    { caseId: "PST-005", input: { complaint: "cough", demographic: "white", ageGroup: "geriatric", expectedDiagnosis: "R05" }, actualOutcome: { diagnosis: "R05" } },
  ];
  const stub = async (input: any) => ({ topDiagnosis: input.expectedDiagnosis, confidence: 0.9 });
  const report = await runProspectiveStudy(demoCases, stub);
  res.json(report);
});

/* ── BIAS ANALYSIS ───────────────────────────────────────────────── */
router.post("/bias/analyze", (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ error: "results array required" }); return;
  }
  res.json(analyzeBias(results));
});

router.get("/bias/demo",  (_req, res) => res.json(runDemoBiasAnalysis()));
router.get("/bias/stats", (_req, res) => res.json(getBiasAnalysisStats()));

/* ── SECURITY EVENTS ─────────────────────────────────────────────── */
router.post("/security/log", (req, res) => {
  const { type, ip, userId, clinicId, path: p, detail } = req.body;
  if (!type) { res.status(400).json({ error: "type required" }); return; }
  res.json(logSecurityEvent({ type, ip, userId, clinicId, path: p, detail }));
});

router.get("/security/events",           (_req, res) => res.json(getSecurityEvents()));
router.get("/security/events/critical",  (_req, res) => res.json(getSecurityEvents({ severity: "CRITICAL" })));
router.get("/security/stats",            (_req, res) => res.json(getSecurityStats()));

router.get("/security/demo", (req, res) => {
  const e1 = logSecurityEvent({ type: "UNAUTHORIZED_ACCESS", ip: "192.168.1.99", path: "/api/admin/users", detail: "no bearer token" });
  const e2 = logSecurityEvent({ type: "RATE_LIMIT_BREACH", ip: "203.0.113.5", path: "/api/triage", detail: "450 req in 60s" });
  res.json({ events: [e1, e2], stats: getSecurityStats() });
});

/* ── HUMAN FACTORS ───────────────────────────────────────────────── */
router.post("/human-factors/track", (req, res) => {
  const { physicianId, encounterId, action, durationMs, success, context } = req.body;
  if (!physicianId || !action) { res.status(400).json({ error: "physicianId and action required" }); return; }
  res.json(trackPhysicianInteraction({ physicianId, encounterId, action, durationMs, success, context }));
});

router.get("/human-factors/history",  (_req, res) => res.json(getInteractionHistory()));
router.get("/human-factors/actions",  (_req, res) => res.json(getActionSummary()));
router.get("/human-factors/stats",    (_req, res) => res.json(getHumanFactorsStats()));

router.post("/human-factors/demo", (_req, res) => {
  const i1 = trackPhysicianInteraction({ physicianId: "MD-001", action: "ALERT_VIEWED", durationMs: 3200, success: true, encounterId: "ENC-100" });
  const i2 = trackPhysicianInteraction({ physicianId: "MD-001", action: "OVERRIDE_INITIATED", durationMs: 8500, success: true, encounterId: "ENC-100" });
  const i3 = trackPhysicianInteraction({ physicianId: "MD-002", action: "SUMMARY_READ", durationMs: 4100, success: true, encounterId: "ENC-101" });
  res.json({ interactions: [i1, i2, i3], summary: getActionSummary(), stats: getHumanFactorsStats() });
});

/* ── FINAL GOVERNED PIPELINE ──────────────────────────────────────── */
router.post("/pipeline/run", (req, res) => {
  const { freeText, complaint, symptoms, vitals, history, patientId, encounterId, physicianId, clinicId, ageYears, isPregnant, actualOutcome } = req.body;
  if (!freeText && !complaint && (!Array.isArray(symptoms) || symptoms.length === 0)) {
    res.status(400).json({ error: "Provide freeText, complaint, or symptoms[]" }); return;
  }
  const result = runFinalPipeline({ freeText, complaint, symptoms, vitals, history, patientId, encounterId, physicianId, clinicId, ageYears, isPregnant, actualOutcome });
  res.json(result);
});

router.get("/pipeline/stats", (_req, res) => res.json(getFinalPipelineStats()));

router.post("/pipeline/demo", (_req, res) => {
  const result = runFinalPipeline({
    freeText:    "chest pain and shortness of breath with leg swelling",
    symptoms:    ["chest pain", "shortness of breath", "leg swelling"],
    vitals:      { heartRate: 112, respiratoryRate: 22, oxygenSaturation: 94 },
    patientId:   "DEMO-PT-001",
    encounterId: "DEMO-ENC-001",
    physicianId: "MD-DEMO-001",
    clinicId:    "CLINIC-001",
    ageYears:    48,
    isPregnant:  false,
  });
  res.json(result);
});

/* ── STATUS ───────────────────────────────────────────────────────── */
router.get("/status", (_req, res) => {
  res.json({
    tier:    "Final Layer",
    modules: 8,
    nlpIntake:        getNLPIntakeStats(),
    versionedRLHF:    getVersionedRLHFStats(),
    fdaCompliance:    getComplianceStats(),
    prospectiveStudy: getProspectiveStudyStats(),
    biasAnalysis:     getBiasAnalysisStats(),
    security:         getSecurityStats(),
    humanFactors:     getHumanFactorsStats(),
    finalPipeline:    getFinalPipelineStats(),
  });
});

export default router;
