import { google } from "googleapis";

export type DiagnosisRow = {
  Diagnosis_ID: string;
  Diagnosis_Name?: string;
  Presentation_Label?: string;
  ICD10_Code?: string;
  System?: string;
  Urgency_Default?: string;
  Red_Flag_Triggers?: string;
  Typical_Duration?: string;
  Notes?: string;
  Active?: string;
};

type CacheEntry = { expiresAt: number; byId: Map<string, DiagnosisRow> };
let CACHE: CacheEntry = { expiresAt: 0, byId: new Map() };
const TTL_MS = 5 * 60 * 1000;

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function authSheets() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  return google.sheets({ version: "v4", auth });
}

function rowToObj(headers: string[], row: any[]): DiagnosisRow {
  const obj: any = {};
  headers.forEach((h, i) => {
    obj[h] = row[i] ?? "";
  });
  return obj as DiagnosisRow;
}

export async function getDiagnosisCatalog(): Promise<Map<string, DiagnosisRow>> {
  const now = Date.now();
  if (CACHE.expiresAt > now) return CACHE.byId;

  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
  const sheets = authSheets();
  const range = `CLINICAL_DIAGNOSES!A1:ZZ5000`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values: any[][] = resp.data.values || [];
  if (values.length < 2) {
    CACHE = { expiresAt: now + TTL_MS, byId: new Map() };
    return CACHE.byId;
  }

  const headers = values[0].map((h) => String(h ?? "").trim());
  const rows = values.slice(1);

  const byId = new Map<string, DiagnosisRow>();
  // Try multiple possible column names for diagnosis ID
  let idIdx = headers.indexOf("Diagnosis_ID");
  if (idIdx < 0) idIdx = headers.indexOf("Diagnosis ID");
  if (idIdx < 0) idIdx = headers.indexOf("diagnosis_id");
  if (idIdx < 0) idIdx = headers.indexOf("DiagnosisID");
  if (idIdx < 0) idIdx = headers.indexOf("ID");
  if (idIdx < 0) {
    console.warn("[DiagnosisCatalog] No Diagnosis_ID column found. Headers:", headers.join(", "));
    CACHE = { expiresAt: now + TTL_MS, byId: new Map() };
    return CACHE.byId;
  }

  for (const r of rows) {
    const id = norm(r[idIdx]);
    if (!id) continue;
    const obj = rowToObj(headers, r);
    const active = norm((obj as any).Active || (obj as any).active);
    if (active && active !== "y" && active !== "yes" && active !== "true" && active !== "") {
      continue;
    }
    byId.set(id, obj);
  }

  console.log(`[DiagnosisCatalog] Loaded ${byId.size} diagnoses from CLINICAL_DIAGNOSES (cached for 5 min)`);
  CACHE = { expiresAt: now + TTL_MS, byId };
  return byId;
}

export function pickDiagnosisDetails(diagnosisIds: string[], catalog: Map<string, DiagnosisRow>): DiagnosisRow[] {
  const result: DiagnosisRow[] = [];
  for (const id of diagnosisIds) {
    const row = catalog.get(norm(id));
    if (row) result.push(row);
  }
  return result;
}
