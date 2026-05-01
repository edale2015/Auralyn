import { Request, Response } from "express";
import { getSheetsClientRW, getSpreadsheetId } from "../sheets/sheetsClient";
import { db } from "../db";
import { sql } from "drizzle-orm";

const REQUIRED_QUESTION_HEADERS = [
  "flow_id","system","chief_complaint","module","order",
  "question_id","question_text","answer_type","required",
  "min","max","choices","help_text","active"
];

const REQUIRED_RULE_HEADERS = [
  "flow_id","system","chief_complaint","module",
  "rule_key","value_type","value","active"
];

function authSheets() {
  return getSheetsClientRW();
}

async function ensureTab(
  sheets: any,
  spreadsheetId: string,
  title: string
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s: any) => s.properties?.title === title
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  }
}

async function ensureHeaders(
  sheets: any,
  spreadsheetId: string,
  tab: string,
  headers: string[]
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  });
}

async function readTabRaw(sheets: any, spreadsheetId: string, tab: string, a1Range = "A1:ZZ5000") {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!${a1Range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values: any[][] = resp.data.values || [];
  if (values.length === 0) return { headers: [] as string[], rows: [] as any[][] };
  const headers = (values[0] || []).map((h: any) => String(h ?? "").trim());
  const rows = values.slice(1);
  return { headers, rows };
}

function buildRowByTargetHeaders(sourceHeaders: string[], sourceRow: any[], targetHeaders: string[]) {
  const srcIdx = (h: string) => sourceHeaders.findIndex((x) => x === h);
  return targetHeaders.map((h) => {
    const i = srcIdx(h);
    return i >= 0 ? (sourceRow[i] ?? "") : "";
  });
}

function makeKey(row: any[], headers: string[], keyCols: string[]) {
  const idx = (h: string) => headers.indexOf(h);
  return keyCols.map((k) => String(row[idx(k)] ?? "").trim()).join("||");
}

function hasHeader(headers: string[], name: string) {
  return headers.includes(name);
}

export async function syncClinicalSheets(req: Request, res: Response) {
  try {
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID!;
    const sheets = authSheets();

    await ensureTab(sheets, spreadsheetId, "CLINICAL_QUESTIONS");
    await ensureTab(sheets, spreadsheetId, "CLINICAL_RULES");

    await ensureHeaders(
      sheets,
      spreadsheetId,
      "CLINICAL_QUESTIONS",
      REQUIRED_QUESTION_HEADERS
    );
    await ensureHeaders(
      sheets,
      spreadsheetId,
      "CLINICAL_RULES",
      REQUIRED_RULE_HEADERS
    );

    res.json({
      ok: true,
      message: "CLINICAL_QUESTIONS and CLINICAL_RULES ensured with headers",
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}

export async function importEntMedications(req: Request, res: Response) {
  try {
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID!;
    const sheets = authSheets();

    const sourceTab = "ENT_Medications_Master";
    const targetTab = "CLINICAL_MEDICATIONS";

    await ensureTab(sheets, spreadsheetId, targetTab);

    const src = await readTabRaw(sheets, spreadsheetId, sourceTab);
    if (!src.headers.length) throw new Error(`Source tab ${sourceTab} is empty or missing headers.`);

    const tgtHead = await readTabRaw(sheets, spreadsheetId, targetTab, "A1:ZZ1");
    const targetHeaders = tgtHead.headers;
    if (!targetHeaders.length) throw new Error(`Target tab ${targetTab} missing headers.`);

    if (!hasHeader(targetHeaders, "System") || !hasHeader(targetHeaders, "Medication_Name") || !hasHeader(targetHeaders, "Route")) {
      throw new Error(`Target tab ${targetTab} must include headers: System, Medication_Name, Route`);
    }

    const newRows = src.rows.map((r) => buildRowByTargetHeaders(src.headers, r, targetHeaders));

    const existing = await readTabRaw(sheets, spreadsheetId, targetTab);
    const existingKeys = new Set(
      (existing.rows || []).map((r) => makeKey(r, targetHeaders, ["System", "Medication_Name", "Route"]))
    );

    const rowsToAppend = newRows.filter((r) => {
      const k = makeKey(r, targetHeaders, ["System", "Medication_Name", "Route"]);
      if (!k.replace(/\|\|/g, "").trim()) return false;
      return !existingKeys.has(k);
    });

    if (rowsToAppend.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${targetTab}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rowsToAppend },
      });
    }

    res.json({
      ok: true,
      sourceTab,
      targetTab,
      scanned: newRows.length,
      appended: rowsToAppend.length,
      skippedDuplicates: newRows.length - rowsToAppend.length,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

export async function importEntDiagnoses(req: Request, res: Response) {
  try {
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID!;
    const sheets = authSheets();

    const sourceTab = "ENT_Diagnosis_Master";
    const targetTab = "CLINICAL_DIAGNOSES";

    await ensureTab(sheets, spreadsheetId, targetTab);

    const src = await readTabRaw(sheets, spreadsheetId, sourceTab);
    if (!src.headers.length) throw new Error(`Source tab ${sourceTab} is empty or missing headers.`);

    let tgtHead = await readTabRaw(sheets, spreadsheetId, targetTab, "A1:ZZ1");
    let targetHeaders = tgtHead.headers;
    
    if (!targetHeaders.length) {
      await ensureHeaders(sheets, spreadsheetId, targetTab, src.headers);
      targetHeaders = src.headers;
    }

    const diagIdCol = targetHeaders.find(h => h === "Diagnosis_ID" || h === "Diagnosis ID");
    if (!diagIdCol) {
      throw new Error(`Target tab ${targetTab} must include header: Diagnosis_ID or Diagnosis ID`);
    }

    const newRows = src.rows.map((r) => buildRowByTargetHeaders(src.headers, r, targetHeaders));

    const existing = await readTabRaw(sheets, spreadsheetId, targetTab);
    const idIdx = targetHeaders.indexOf(diagIdCol);
    const existingIds = new Set(
      (existing.rows || []).map((r) => String(r[idIdx] ?? "").trim()).filter(Boolean)
    );

    const rowsToAppend = newRows.filter((r) => {
      const id = String(r[idIdx] ?? "").trim();
      if (!id) return false;
      return !existingIds.has(id);
    });

    if (rowsToAppend.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${targetTab}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rowsToAppend },
      });
    }

    res.json({
      ok: true,
      sourceTab,
      targetTab,
      scanned: newRows.length,
      appended: rowsToAppend.length,
      skippedDuplicates: newRows.length - rowsToAppend.length,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

// ─── KB Table Exports (Issue 2 fix) ──────────────────────────────────────────
// Write each KB table to a dedicated sheet tab so physicians can audit and
// correct the full KB state without direct database access.

async function exportKBTableToSheet(
  tabName:   string,
  headers:   string[],
  queryFn:   () => Promise<any[]>,
  res:       Response
) {
  const exportedAt = new Date().toISOString();
  try {
    const spreadsheetId = getSpreadsheetId();
    const sheets        = getSheetsClientRW();

    const meta   = await sheets.spreadsheets.get({ spreadsheetId });
    const hasTab = meta.data.sheets?.some((s: any) => s.properties?.title === tabName);
    if (!hasTab) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
    }

    const rows     = await queryFn();
    const dataRows = rows.map(r => headers.map(h => {
      const v = r[h];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join("|");
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }));

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabName}!A:ZZ` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody:      { values: [headers, ...dataRows] },
    });

    console.log(`[KBExport] Exported ${dataRows.length} rows to ${tabName}`);
    res.json({ ok: true, tab: tabName, rowsExported: dataRows.length, exportedAt });
  } catch (err: any) {
    console.error(`[KBExport] ${tabName}:`, err.message);
    res.status(500).json({ ok: false, tab: tabName, error: err.message, exportedAt });
  }
}

export async function exportKBDiagnoses(req: Request, res: Response) {
  await exportKBTableToSheet(
    "KB_DIAGNOSIS_RULES",
    ["id","system","chief_complaint","diagnosis_name","red_flag","cluster_id",
     "confidence_weight","disposition_default","source_tab","active"],
    () => db.execute(sql`
      SELECT id, system, chief_complaint, diagnosis_name, red_flag, cluster_id,
             confidence_weight, disposition_default, source_tab, active
      FROM kb_diagnosis_rules WHERE active = true ORDER BY system, chief_complaint
    `).then(r => r.rows as any[]),
    res
  );
}

export async function exportKBRedFlags(req: Request, res: Response) {
  await exportKBTableToSheet(
    "KB_RED_FLAG_RULES",
    ["id","complaint_id","system","condition_text","action_text","severity","source_tab","active"],
    () => db.execute(sql`
      SELECT id, complaint_id, system, condition_text, action_text, severity, source_tab, active
      FROM kb_red_flag_rules WHERE active = true ORDER BY severity, complaint_id
    `).then(r => r.rows as any[]),
    res
  );
}

export async function exportKBTreatments(req: Request, res: Response) {
  await exportKBTableToSheet(
    "KB_TREATMENT_RULES",
    ["id","complaint_id","diagnosis_id","medication_name","dose","route","duration",
     "contraindications","med_group_id","source_tab","active"],
    () => db.execute(sql`
      SELECT id, complaint_id, diagnosis_id, medication_name, dose, route, duration,
             contraindications, med_group_id, source_tab, active
      FROM kb_treatment_rules WHERE active = true ORDER BY complaint_id, medication_name
    `).then(r => r.rows as any[]),
    res
  );
}

export async function exportKBDispositions(req: Request, res: Response) {
  await exportKBTableToSheet(
    "KB_DISPOSITION_RULES",
    ["id","complaint_id","cluster_id","diagnosis_id","disposition","criteria","priority","source_tab","active"],
    () => db.execute(sql`
      SELECT id, complaint_id, cluster_id, diagnosis_id, disposition, criteria, priority, source_tab, active
      FROM kb_disposition_rules WHERE active = true ORDER BY complaint_id, priority
    `).then(r => r.rows as any[]),
    res
  );
}
