import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreSignoffStore } from "./firestoreSignoffStore";
import type { CaseRecord } from "../types/case";

export interface ReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ExportReadinessResult {
  caseId: string;
  ready: boolean;
  checks: ReadinessCheck[];
}

export async function checkExportReadiness(caseId: string): Promise<ExportReadinessResult> {
  const caseRecord = await firestoreCaseStore.getCase(caseId);
  if (!caseRecord) {
    return {
      caseId,
      ready: false,
      checks: [{ key: "case_exists", label: "Case exists", passed: false, detail: "Case not found" }],
    };
  }

  const checks: ReadinessCheck[] = [];

  checks.push({
    key: "has_disposition",
    label: "Disposition assigned",
    passed: !!caseRecord.engineResult?.recommendedDisposition,
    detail: caseRecord.engineResult?.recommendedDisposition || "No disposition",
  });

  let signoffs: any[] = [];
  try {
    signoffs = await firestoreSignoffStore.listSignoffsForCase(caseId);
  } catch {
  }
  const hasApprovedSignoff = signoffs.some((s: any) => s.decision === "approve" || s.decision === "approved");
  checks.push({
    key: "signoff_approved",
    label: "Physician signoff approved",
    passed: hasApprovedSignoff,
    detail: hasApprovedSignoff
      ? `${signoffs.length} signoff(s), approved`
      : `${signoffs.length} signoff(s), none approved`,
  });

  checks.push({
    key: "note_draft",
    label: "Note draft available",
    passed: !!caseRecord.noteDraft,
    detail: caseRecord.noteDraft ? "Draft present" : "No note draft",
  });

  const redFlags = caseRecord.engineResult?.triggeredRedFlags ?? [];
  checks.push({
    key: "red_flags_reviewed",
    label: "Red flags addressed",
    passed: redFlags.length === 0 || hasApprovedSignoff,
    detail: redFlags.length === 0
      ? "No red flags"
      : `${redFlags.length} red flag(s) — ${hasApprovedSignoff ? "reviewed" : "not yet reviewed"}`,
  });

  const criticalUnanswered = caseRecord.unansweredCriticalQuestions ?? [];
  checks.push({
    key: "critical_questions",
    label: "Critical questions answered",
    passed: criticalUnanswered.length === 0,
    detail: criticalUnanswered.length === 0
      ? "All answered"
      : `${criticalUnanswered.length} unanswered critical question(s)`,
  });

  const alreadyExported = caseRecord.exportedAt || caseRecord.status === "EXPORTED";
  checks.push({
    key: "not_already_exported",
    label: "Not already exported",
    passed: !alreadyExported,
    detail: alreadyExported ? "Already exported" : "Not yet exported",
  });

  const ready = checks.every((c) => c.passed);

  return { caseId, ready, checks };
}
