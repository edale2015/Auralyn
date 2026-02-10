import { getSheetsClient } from "./sheetsClient";

export async function getSheetRowsWithSpreadsheetId(tabName: string, spreadsheetId: string) {
  const sheets = getSheetsClient();

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
