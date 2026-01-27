import { google } from "googleapis";

export type SheetRow = Record<string, any>;

export interface SheetResult {
  header: string[];
  rows: any[][];
  rowsAsObjects: SheetRow[];
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = credsJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      })
    : new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export async function getSheetRows(
  tabName: string,
  range: string = "A1:Z1000"
): Promise<SheetResult> {
  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
  const sheets = getSheetsClient();

  const fullRange = `${tabName}!${range}`;
  console.log(`[SheetHelper] Fetching ${fullRange}...`);

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = resp.data.values || [];
  if (values.length < 1) {
    console.warn(`[SheetHelper] Tab "${tabName}" appears empty`);
    return { header: [], rows: [], rowsAsObjects: [] };
  }

  const header = values[0].map((h: any) => String(h ?? "").trim());
  const rows = values.slice(1);

  const rowsAsObjects: SheetRow[] = rows.map((row) => {
    const obj: SheetRow = {};
    header.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    return obj;
  });

  console.log(`[SheetHelper] Loaded ${rows.length} rows from ${tabName}`);
  return { header, rows, rowsAsObjects };
}

export function toBoolYN(v: any): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
}

export function toNumOrNull(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toStringOrNull(v: any): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

export function splitCommas(v: any): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
