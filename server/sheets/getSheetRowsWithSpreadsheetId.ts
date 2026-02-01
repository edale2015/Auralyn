import { google } from "googleapis";

function getAuth() {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return credsJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      })
    : new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
}

export async function getSheetRowsWithSpreadsheetId(tabName: string, spreadsheetId: string) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:Z5000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = resp.data.values || [];
  if (!values.length) return { header: [], rows: [], rowsAsObjects: [] as any[] };

  const header = values[0].map((h) => String(h ?? "").trim());
  const rows = values.slice(1);

  const rowsAsObjects = rows.map((r) => {
    const obj: any = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });

  return { header, rows, rowsAsObjects };
}
