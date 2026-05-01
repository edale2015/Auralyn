import { google } from "googleapis";

let sheets: ReturnType<typeof google.sheets> | null = null;
let sheetsRW: ReturnType<typeof google.sheets> | null = null;

function buildAuth(scopes: string[]) {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return credsJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes,
      })
    : new google.auth.GoogleAuth({ scopes });
}

export function getSheetsClient() {
  if (sheets) return sheets;
  const auth = buildAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

export function getSheetsClientRW() {
  if (sheetsRW) return sheetsRW;
  const auth = buildAuth(["https://www.googleapis.com/auth/spreadsheets"]);
  sheetsRW = google.sheets({ version: "v4", auth });
  return sheetsRW;
}

/**
 * Returns the canonical spreadsheet ID.
 * SHEETS_SPREADSHEET_ID is the primary (standardized) variable.
 * PACKS_SPREADSHEET_ID and GOOGLE_SHEET_ID are preserved for backward compatibility.
 */
export function getSpreadsheetId(): string {
  const id =
    process.env.SHEETS_SPREADSHEET_ID ??
    process.env.PACKS_SPREADSHEET_ID ??
    process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("No spreadsheet ID configured — set SHEETS_SPREADSHEET_ID");
  return id;
}
