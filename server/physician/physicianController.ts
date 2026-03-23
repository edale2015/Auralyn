import { logDecisionTrace, getAuditLog, getAuditStats, seedDemoAudit } from "./auditEngine";
import { getGraphSummary, findSimilarCases, getDecisionsByTriage } from "../memory/memoryQuery";
import { logClinicalCase } from "../memory/memoryIngest";

export interface PendingCase {
  id: string;
  patientId: string;
  triage: "immediate" | "urgent" | "routine" | "non-urgent";
  riskScore: number;
  complaints: string[];
  agentDecision: string;
  status: "pending_review" | "approved" | "overridden" | "escalated";
  submittedAt: string;
  reviewedBy?: string;
  notes?: string;
}

const pendingCases: PendingCase[] = [];

function seedCases() {
  if (pendingCases.length > 0) return;
  const demos: PendingCase[] = [
    { id: "case-001", patientId: "pt-101", triage: "urgent", riskScore: 0.62, complaints: ["ear_pain", "fever"], agentDecision: "otoscopy + oral_exam", status: "pending_review", submittedAt: new Date(Date.now() - 18 * 60000).toISOString() },
    { id: "case-002", patientId: "pt-102", triage: "routine", riskScore: 0.3, complaints: ["sore_throat"], agentDecision: "oral_exam", status: "pending_review", submittedAt: new Date(Date.now() - 45 * 60000).toISOString() },
    { id: "case-003", patientId: "pt-103", triage: "immediate", riskScore: 0.88, complaints: ["chest_pain", "breathlessness"], agentDecision: "ekg_assist + auscultation", status: "escalated", submittedAt: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: "case-004", patientId: "pt-104", triage: "routine", riskScore: 0.22, complaints: ["cough"], agentDecision: "auscultation", status: "approved", submittedAt: new Date(Date.now() - 120 * 60000).toISOString(), reviewedBy: "dr-system" },
  ];
  pendingCases.push(...demos);
  seedDemoAudit();
}

export function getCases(statusFilter?: PendingCase["status"]): PendingCase[] {
  seedCases();
  if (statusFilter) return pendingCases.filter(c => c.status === statusFilter);
  return [...pendingCases].sort((a, b) => {
    const urgencyOrder = { immediate: 0, urgent: 1, routine: 2, "non-urgent": 3 };
    return urgencyOrder[a.triage] - urgencyOrder[b.triage];
  });
}

export function getCaseById(id: string): PendingCase | null {
  seedCases();
  return pendingCases.find(c => c.id === id) ?? null;
}

export function reviewCase(id: string, decision: "approved" | "overridden" | "escalated", reviewedBy: string, notes?: string): PendingCase | null {
  const c = pendingCases.find(c => c.id === id);
  if (!c) return null;

  const before = { status: c.status };
  c.status = decision;
  c.reviewedBy = reviewedBy;
  c.notes = notes;

  logDecisionTrace({
    actor: "physician",
    action: `case_${decision}`,
    entityType: "decision",
    entityId: id,
    before,
    after: { status: decision, notes },
    approved: decision === "approved",
    notes,
    riskScore: c.riskScore,
  });

  logClinicalCase({
    patientId: c.patientId,
    complaints: c.complaints,
    triage: c.triage,
    riskScore: c.riskScore,
    recommendedActions: c.agentDecision.split(" + "),
    outcome: decision === "approved" ? "correct" : "unknown",
  });

  return c;
}

export function getDashboardStats() {
  seedCases();
  const pending = pendingCases.filter(c => c.status === "pending_review").length;
  const escalated = pendingCases.filter(c => c.status === "escalated").length;
  const approved = pendingCases.filter(c => c.status === "approved").length;
  const highRisk = pendingCases.filter(c => c.riskScore > 0.7).length;
  const memorySummary = getGraphSummary();
  const auditStats = getAuditStats();

  return { pending, escalated, approved, highRisk, total: pendingCases.length, memorySummary, auditStats };
}
