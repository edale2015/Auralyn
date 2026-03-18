import express from "express";
import crypto from "crypto";
import { parseSmartIntake, getNextBestQuestion } from "../engines/smartIntakeEngine";
import { scoreIntakeRisk } from "../engines/intakeRiskScorer";
import { generateAutoPlan } from "../engines/autoPlanEngine";
import { computeQueuePriority, sortQueue } from "../engines/queuePrioritizationEngine";
import { executeBatchApproval } from "../engines/batchApprovalEngine";
import { recordOutcome, buildOutcomeAnalytics } from "../engines/outcomeFeedbackEngine";
import { intakeCaseStore, StructuredIntakeCase } from "../services/intakeCaseStore";
import { intakeAuditLog } from "../services/intakeAuditLog";

const router = express.Router();

router.post("/webhook/twilio", async (req, res) => {
  const messageBody = req.body.Body || "";
  const from = req.body.From || "unknown";
  const source = inferSource(req.body);

  const transcript = [{ role: "patient" as const, text: messageBody, at: new Date().toISOString() }];
  const intake = parseSmartIntake(from, source, transcript);
  const risk = scoreIntakeRisk(intake);
  const plan = generateAutoPlan({ ...intake, ...risk });
  const queuePriority = computeQueuePriority({ ...intake, ...risk, ...plan } as any);

  const newCase: StructuredIntakeCase = {
    id: crypto.randomUUID(),
    patientId: from,
    source,
    chiefComplaint: intake.chiefComplaint,
    age: intake.age,
    sex: intake.sex,
    symptomDuration: intake.symptomDuration,
    answers: intake.answers,
    transcript,
    redFlags: intake.redFlags,
    missingCriticalData: intake.missingCriticalData,
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    confidenceScore: risk.confidenceScore,
    differential: plan.differential,
    proposedDisposition: plan.proposedDisposition,
    proposedPlan: plan.proposedPlan,
    reviewReason: plan.reviewReason,
    queuePriority,
    queueStatus: risk.riskLevel === "low" && risk.confidenceScore >= 0.85 && !plan.reviewReason && plan.proposedPlan ? "auto_resolved" : "needs_review",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  intakeCaseStore.saveCase(newCase);
  intakeAuditLog.write({ actor: "smart_intake_engine", entityId: newCase.id, event: "case_created", details: { source, riskLevel: newCase.riskLevel, confidenceScore: newCase.confidenceScore, queueStatus: newCase.queueStatus } });

  if (newCase.queueStatus === "auto_resolved" && newCase.proposedPlan) {
    return res.type("text/xml").send(twimlReply(newCase.proposedPlan.patientMessage));
  }
  return res.type("text/xml").send(twimlReply("Thanks. Your case has been received and is being reviewed by a clinician. We'll message you shortly."));
});

router.post("/web-intake", (req, res) => {
  const { patientId, message, source } = req.body;
  const transcript = [{ role: "patient" as const, text: message || "", at: new Date().toISOString() }];
  const intake = parseSmartIntake(patientId || "web-" + crypto.randomUUID().slice(0, 8), source || "web", transcript);
  const risk = scoreIntakeRisk(intake);
  const plan = generateAutoPlan({ ...intake, ...risk });
  const queuePriority = computeQueuePriority({ ...intake, ...risk, ...plan } as any);

  const nextQ = getNextBestQuestion(intake);

  const newCase: StructuredIntakeCase = {
    id: crypto.randomUUID(),
    patientId: intake.patientId,
    source: intake.source,
    chiefComplaint: intake.chiefComplaint,
    age: intake.age,
    sex: intake.sex,
    symptomDuration: intake.symptomDuration,
    answers: intake.answers,
    transcript,
    redFlags: intake.redFlags,
    missingCriticalData: intake.missingCriticalData,
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    confidenceScore: risk.confidenceScore,
    differential: plan.differential,
    proposedDisposition: plan.proposedDisposition,
    proposedPlan: plan.proposedPlan,
    reviewReason: plan.reviewReason,
    queuePriority,
    queueStatus: risk.riskLevel === "low" && risk.confidenceScore >= 0.85 && !plan.reviewReason && plan.proposedPlan ? "auto_resolved" : "needs_review",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  intakeCaseStore.saveCase(newCase);
  intakeAuditLog.write({ actor: "smart_intake_engine", entityId: newCase.id, event: "case_created", details: { source: newCase.source, riskLevel: newCase.riskLevel } });

  res.json({ caseId: newCase.id, riskLevel: newCase.riskLevel, queueStatus: newCase.queueStatus, nextQuestion: nextQ, disposition: newCase.proposedDisposition });
});

router.get("/review-queue", (req, res) => {
  const items = intakeCaseStore.listCases().filter((c) => c.queueStatus === "needs_review" || c.queueStatus === "new");
  res.json(sortQueue(items));
});

router.get("/all-cases", (req, res) => {
  const all = intakeCaseStore.listCases();
  const byStatus: Record<string, number> = {};
  all.forEach((c) => { byStatus[c.queueStatus] = (byStatus[c.queueStatus] || 0) + 1; });
  res.json({ total: all.length, byStatus, cases: sortQueue(all) });
});

router.get("/case/:id", (req, res) => {
  const item = intakeCaseStore.getCase(req.params.id);
  if (!item) return res.status(404).json({ error: "Case not found" });
  res.json(item);
});

router.post("/batch-approve", (req, res) => {
  const results = executeBatchApproval(req.body);
  res.json({ updated: results.length, results });
});

router.post("/approve-all-safe", (req, res) => {
  const physicianId = req.body.physicianId || "system_auto";
  const safeIds = intakeCaseStore.listCases()
    .filter((c) => c.queueStatus === "needs_review" && c.riskLevel === "low" && c.confidenceScore >= 0.85 && c.redFlags.length === 0 && c.proposedPlan && c.reviewReason !== "red_flags_detected")
    .map((c) => c.id);
  const results = executeBatchApproval({ caseIds: safeIds, physicianId, action: "approve" });
  res.json({ approvedCount: results.length, results });
});

router.post("/outcomes", (req, res) => {
  const saved = recordOutcome(req.body);
  res.json(saved);
});

router.get("/outcomes/analytics", (req, res) => {
  res.json(buildOutcomeAnalytics());
});

router.get("/audit-log", (req, res) => {
  res.json(intakeAuditLog.list());
});

function inferSource(body: any): "sms" | "whatsapp" | "web" {
  const from = String(body.From || "");
  return from.startsWith("whatsapp:") ? "whatsapp" : "sms";
}

function twimlReply(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

function escapeXml(input: string) {
  return input.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default router;
