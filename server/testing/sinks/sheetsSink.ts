import { google } from "googleapis";
import { TestRunRecord } from "../types";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function appendToSheets(record: TestRunRecord) {
  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
  const tab = process.env.TEST_RUNS_SHEET_TAB || "TEST_RUNS";

  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = credsJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      })
    : new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

  const sheets = google.sheets({ version: "v4", auth });

  const row = [
    record.ts,
    record.system,
    record.flowId,
    record.chiefComplaint,
    record.score.pass ? "PASS" : "FAIL",
    record.score.severity,
    record.expected.expectedDisposition,
    record.output.disposition,
    record.output.redFlag ? "Y" : "N",
    record.expected.reasons.join(";"),
    record.score.issues.map(i => i.code).join(";"),
    (record.routerText || "").slice(0, 120),
    JSON.stringify(record.tags || []),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}
