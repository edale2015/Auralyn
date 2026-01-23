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
