/**
 * ruleMapValidator.ts
 * Validates completeness and clinical safety of every complaint's rule chain.
 * Writes results to the VALIDATION_REPORT sheet tab.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { google } from "googleapis";

export interface ValidationIssue {
  complaint_id:   string;
  system:         string;
  score:          number;
  rule_type:      string;
  issue:          string;
  severity:       "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  recommendation: string;
}

export interface ValidationSummary {
  ok:              boolean;
  validatedAt:     string;
  totalComplaints: number;
  issueCount:      number;
  criticalCount:   number;
  highCount:       number;
  mediumCount:     number;
  lowCount:        number;
  issues:          ValidationIssue[];
  sheetExported:   boolean;
}

export async function validateRuleMap(): Promise<ValidationSummary> {
  const validatedAt = new Date().toISOString();
  const issues: ValidationIssue[] = [];

  const rows = await db.execute(sql`
    SELECT complaint_id, system, label, completeness_score,
           red_flag_count, diagnosis_count, treatment_count,
           question_count, disposition_count, cannot_miss_count, gap_flags
    FROM mv_master_rule_map
    ORDER BY completeness_score ASC
  `);

  for (const r of rows.rows as any[]) {
    const id     = r.complaint_id;
    const sys    = r.system;
    const score  = r.completeness_score;

    if (r.red_flag_count === 0) {
      issues.push({
        complaint_id: id, system: sys, score,
        rule_type: "red_flag_rules",
        issue: `No red flag rules — system cannot escalate dangerous presentations`,
        severity: "CRITICAL",
        recommendation: `Add ≥1 red flag rule for ${id} covering life-threatening presentations`,
      });
    }

    if (r.diagnosis_count === 0) {
      issues.push({
        complaint_id: id, system: sys, score,
        rule_type: "diagnosis_rules",
        issue: `No diagnosis rules — clinical brain has no differential to reason over`,
        severity: "CRITICAL",
        recommendation: `Import diagnosis rules for ${id} from system master sheet`,
      });
    }

    if (r.treatment_count === 0 && r.diagnosis_count > 0) {
      issues.push({
        complaint_id: id, system: sys, score,
        rule_type: "treatment_rules",
        issue: `No treatment rules — discharge instructions will be empty`,
        severity: "HIGH",
        recommendation: `Add treatment rules for the top diagnoses under ${id}`,
      });
    }

    if (r.question_count < 3 && r.diagnosis_count > 0) {
      issues.push({
        complaint_id: id, system: sys, score,
        rule_type: "questions",
        issue: `Only ${r.question_count} question(s) — intake is too shallow for reliable triage`,
        severity: r.question_count === 0 ? "HIGH" : "MEDIUM",
        recommendation: `Add ≥3 clinical questions for ${id} covering red flags, duration, severity`,
      });
    }

    if (r.disposition_count === 0) {
      issues.push({
        complaint_id: id, system: sys, score,
        rule_type: "disposition_rules",
        issue: `No disposition rules — system will fall back to default disposition logic`,
        severity: "MEDIUM",
        recommendation: `Add disposition rules for ${id} (ED_NOW, UC_URGENT, HOME_CARE etc.)`,
      });
    }

    if (r.cannot_miss_count === 0 && r.diagnosis_count > 2) {
      issues.push({
        complaint_id: id, system: sys, score,
        rule_type: "diagnosis_rules",
        issue: `No cannot-miss diagnoses flagged — physician must manually verify P1 differential`,
        severity: "MEDIUM",
        recommendation: `Set cannot_miss=true on ≥1 life-threatening diagnosis for ${id}`,
      });
    }
  }

  const criticalCount = issues.filter(i => i.severity === "CRITICAL").length;
  const highCount     = issues.filter(i => i.severity === "HIGH").length;
  const mediumCount   = issues.filter(i => i.severity === "MEDIUM").length;
  const lowCount      = issues.filter(i => i.severity === "LOW").length;

  const sheetExported = await exportValidationReport(validatedAt, issues);

  return {
    ok: true,
    validatedAt,
    totalComplaints: (rows.rows as any[]).length,
    issueCount:      issues.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    issues,
    sheetExported,
  };
}

async function exportValidationReport(validatedAt: string, issues: ValidationIssue[]): Promise<boolean> {
  try {
    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credsJson) return false;

    const spreadsheetId =
      process.env.PACKS_SPREADSHEET_ID ??
      process.env.SHEETS_SPREADSHEET_ID ??
      process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) return false;

    const auth  = new google.auth.GoogleAuth({ credentials: JSON.parse(credsJson), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });

    // Ensure VALIDATION_REPORT tab exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const hasTab = meta.data.sheets?.some(s => s.properties?.title === "VALIDATION_REPORT");
    if (!hasTab) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: "VALIDATION_REPORT" } } }] },
      });
    }

    const header = [["validated_at","complaint_id","system","score","rule_type","issue","severity","recommendation"]];
    const dataRows = issues.map(i => [
      validatedAt, i.complaint_id, i.system, i.score,
      i.rule_type, i.issue, i.severity, i.recommendation,
    ]);

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: "VALIDATION_REPORT!A:Z" });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "VALIDATION_REPORT!A1",
      valueInputOption: "RAW",
      requestBody: { values: [...header, ...dataRows] },
    });
    return true;
  } catch { return false; }
}
