/**
 * exportMasterRulesToSheets.ts
 * Exports kb_master_rules to the MASTER_RULE_MAP Google Sheet tab
 * with the exact 27-column structure defined in the Auralyn Master Rule Map spec.
 */

import { google } from "googleapis";
import { db } from "../db";
import { sql } from "drizzle-orm";

const TAB_NAME = "MASTER_RULE_MAP";

export const MASTER_RULE_MAP_HEADERS = [
  "rule_id","rule_name","rule_type","priority",
  "complaint_id","cluster_id","diagnosis_id",
  "modifier_dependencies","question_dependencies","red_flag_dependencies",
  "input_fields","logic_description","logic_type",
  "source_tab","target_tabs","outputs",
  "disposition_impact","medication_impact","workup_impact",
  "safety_level","override_rules","confidence_weight",
  "active","version","last_updated","owner","notes",
];

export async function exportMasterRulesToSheets(): Promise<{
  ok: boolean; rowsExported: number; exportedAt: string; error?: string;
}> {
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

    // Ensure MASTER_RULE_MAP tab exists (create/replace)
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const hasTab = meta.data.sheets?.some(s => s.properties?.title === TAB_NAME);
    if (!hasTab) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] },
      });
    }

    const rows = await db.execute(sql`
      SELECT rule_id, rule_name, rule_type, priority,
             complaint_id, cluster_id, diagnosis_id,
             modifier_dependencies, question_dependencies, red_flag_dependencies,
             input_fields, logic_description, logic_type,
             source_tab, target_tabs, outputs,
             disposition_impact, medication_impact, workup_impact,
             safety_level, override_rules, confidence_weight,
             active, version, last_updated, owner, notes
      FROM kb_master_rules
      WHERE active = true
      ORDER BY priority ASC, safety_level DESC, rule_type, rule_id
    `);

    const arrToStr = (v: any) =>
      Array.isArray(v) ? v.join(", ") : (v ?? "");
    const objToStr = (v: any) =>
      v && typeof v === "object" ? JSON.stringify(v) : (v ?? "");

    const dataRows = (rows.rows as any[]).map(r => [
      r.rule_id,
      r.rule_name,
      r.rule_type,
      r.priority,
      r.complaint_id ?? "",
      r.cluster_id ?? "",
      r.diagnosis_id ?? "",
      arrToStr(r.modifier_dependencies),
      arrToStr(r.question_dependencies),
      arrToStr(r.red_flag_dependencies),
      arrToStr(r.input_fields),
      r.logic_description ?? "",
      r.logic_type ?? "",
      r.source_tab ?? "",
      arrToStr(r.target_tabs),
      objToStr(r.outputs),
      r.disposition_impact ?? "",
      r.medication_impact ?? "",
      r.workup_impact ?? "",
      r.safety_level ?? "",
      arrToStr(r.override_rules),
      r.confidence_weight ?? "",
      r.active ? "TRUE" : "FALSE",
      r.version ?? "",
      r.last_updated ? new Date(r.last_updated).toISOString() : "",
      r.owner ?? "",
      r.notes ?? "",
    ]);

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TAB_NAME}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [MASTER_RULE_MAP_HEADERS, ...dataRows] },
    });

    console.log(`[MasterRulesExport] Wrote ${dataRows.length} rows to ${TAB_NAME} (27 columns)`);
    return { ok: true, rowsExported: dataRows.length, exportedAt };
  } catch (e: any) {
    console.error("[MasterRulesExport] Error:", e.message);
    return { ok: false, rowsExported: 0, exportedAt, error: e.message };
  }
}
