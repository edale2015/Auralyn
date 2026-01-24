import { google } from "googleapis";
import { Request, Response } from "express";

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
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  return google.sheets({ version: "v4", auth });
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

    const tgtHead = await readTabRaw(sheets, spreadsheetId, targetTab, "A1:ZZ1");
    const targetHeaders = tgtHead.headers;
    if (!targetHeaders.length) throw new Error(`Target tab ${targetTab} missing headers.`);

    if (!hasHeader(targetHeaders, "Diagnosis_ID")) {
      throw new Error(`Target tab ${targetTab} must include header: Diagnosis_ID`);
    }

    const newRows = src.rows.map((r) => buildRowByTargetHeaders(src.headers, r, targetHeaders));

    const existing = await readTabRaw(sheets, spreadsheetId, targetTab);
    const idIdx = targetHeaders.indexOf("Diagnosis_ID");
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
