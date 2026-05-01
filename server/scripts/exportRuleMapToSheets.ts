/**
 * exportRuleMapToSheets.ts
 * Exports the mv_master_rule_map materialized view to the MASTER_RULE_MAP
 * Google Sheet tab (writes fresh rows on every call — idempotent).
 */

import { google } from "googleapis";
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface ExportResult {
  ok:          boolean;
  rowsExported: number;
  sheetTab:    string;
  exportedAt:  string;
  error?:      string;
}

export async function exportRuleMapToSheets(): Promise<ExportResult> {
  const exportedAt = new Date().toISOString();

  try {
    const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credsJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

    const spreadsheetId =
      process.env.PACKS_SPREADSHEET_ID ??
      process.env.SHEETS_SPREADSHEET_ID ??
      process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("No spreadsheet ID configured");

    const auth   = new google.auth.GoogleAuth({ credentials: JSON.parse(credsJson), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets  = google.sheets({ version: "v4", auth });

    // Ensure MASTER_RULE_MAP tab exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const hasTab = meta.data.sheets?.some(s => s.properties?.title === "MASTER_RULE_MAP");
    if (!hasTab) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: "MASTER_RULE_MAP" } } }] },
      });
    }

    // Refresh the view so we're exporting current data
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_master_rule_map`);

    const rows = await db.execute(sql`
      SELECT complaint_id, system, label, enabled,
             red_flag_count, diagnosis_count, treatment_count,
             question_count, disposition_count, cannot_miss_count,
             completeness_score, gap_flags
      FROM mv_master_rule_map
      ORDER BY system, completeness_score DESC
    `);

    const header = [[
      "complaint_id","system","label","enabled",
      "red_flag_count","diagnosis_count","treatment_count",
      "question_count","disposition_count","cannot_miss_count",
      "completeness_score","missing_red_flags","missing_diagnoses",
      "missing_treatments","missing_questions","missing_disposition",
      "missing_cannot_miss","last_exported_at",
    ]];

    const dataRows = (rows.rows as any[]).map(r => {
      const gaps = r.gap_flags ?? {};
      return [
        r.complaint_id, r.system, r.label, r.enabled,
        r.red_flag_count, r.diagnosis_count, r.treatment_count,
        r.question_count, r.disposition_count, r.cannot_miss_count,
        r.completeness_score,
        gaps.missing_red_flags   ? "Y" : "N",
        gaps.missing_diagnoses   ? "Y" : "N",
        gaps.missing_treatments  ? "Y" : "N",
        gaps.missing_questions   ? "Y" : "N",
        gaps.missing_disposition ? "Y" : "N",
        gaps.missing_cannot_miss ? "Y" : "N",
        exportedAt,
      ];
    });

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: "MASTER_RULE_MAP!A:Z" });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "MASTER_RULE_MAP!A1",
      valueInputOption: "RAW",
      requestBody: { values: [...header, ...dataRows] },
    });

    console.log(`[RuleMapExport] Exported ${dataRows.length} rows to MASTER_RULE_MAP tab`);
    return { ok: true, rowsExported: dataRows.length, sheetTab: "MASTER_RULE_MAP", exportedAt };
  } catch (e: any) {
    console.error("[RuleMapExport] Error:", e.message);
    return { ok: false, rowsExported: 0, sheetTab: "MASTER_RULE_MAP", exportedAt, error: e.message };
  }
}
