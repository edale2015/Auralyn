import { firestoreCaseStore } from "../firestoreCaseStore";

export interface ValidationResult {
  caseId: string;
  valid: boolean;
  checks: { name: string; passed: boolean; message: string }[];
  timestamp: string;
}

export async function validateCase(caseId: string): Promise<ValidationResult> {
  const c = await firestoreCaseStore.getCase(caseId);
  if (!c) return { caseId, valid: false, checks: [{ name: "exists", passed: false, message: "Case not found" }], timestamp: new Date().toISOString() };

  const checks: ValidationResult["checks"] = [];

  checks.push({ name: "has_complaint", passed: !!c.complaintId, message: c.complaintId ? `Complaint: ${c.complaintId}` : "Missing complaint ID" });
  checks.push({ name: "has_engine_result", passed: !!c.engineResult, message: c.engineResult ? "Engine result present" : "Missing engine result" });
  checks.push({ name: "has_disposition", passed: !!c.engineResult?.recommendedDisposition, message: c.engineResult?.recommendedDisposition ? `Disposition: ${c.engineResult.recommendedDisposition}` : "Missing disposition" });
  checks.push({ name: "has_answers", passed: Object.keys(c.answers || {}).length > 0, message: `${Object.keys(c.answers || {}).length} answers recorded` });

  const redFlags = c.engineResult?.triggeredRedFlags ?? [];
  if (redFlags.length > 0) {
    checks.push({ name: "red_flags_acknowledged", passed: c.status !== "DRAFT", message: `${redFlags.length} red flags: ${redFlags.join(", ")}` });
  }

  return { caseId, valid: checks.every((ch) => ch.passed), checks, timestamp: new Date().toISOString() };
}

export async function validateBatch(limit = 50): Promise<{ total: number; valid: number; invalid: number; results: ValidationResult[] }> {
  const cases = await firestoreCaseStore.listCases({ limit });
  const results: ValidationResult[] = [];
  for (const c of cases) {
    results.push(await validateCase(c.caseId));
  }
  const valid = results.filter((r) => r.valid).length;
  return { total: results.length, valid, invalid: results.length - valid, results };
}
