import fs from "fs";
import path from "path";
import { google } from "googleapis";

type Mode = "append" | "upsert";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"' && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      lines.push(cur.replace(/\r$/, ""));
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length) lines.push(cur.replace(/\r$/, ""));

  const splitRow = (row: string) => {
    const out: string[] = [];
    let v = "";
    let q = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      const next = row[i + 1];
      if (ch === '"' && next === '"') {
        v += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        q = !q;
        continue;
      }
      if (ch === "," && !q) {
        out.push(v);
        v = "";
        continue;
      }
      v += ch;
    }
    out.push(v);
    return out.map(s => s.trim());
  };

  const headers = splitRow(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).filter(l => l.trim().length > 0).map(line => {
    const vals = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = vals[idx] ?? ""));
    return obj;
  });

  return { headers, rows };
}

async function getSheetsClient() {
  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
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
  return { sheets, spreadsheetId };
}

async function getTabHeader(sheets: any, spreadsheetId: string, tabName: string): Promise<string[]> {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:ZZ1`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = resp.data.values || [];
  if (!values.length) throw new Error(`No header row found in tab ${tabName}`);
  return values[0].map((h: any) => String(h ?? "").trim());
}

async function findRowByKey(
  sheets: any,
  spreadsheetId: string,
  tabName: string,
  header: string[],
  keyCol: string,
  keyVal: string
): Promise<number | null> {
  const keyIndex = header.findIndex(h => h === keyCol);
  if (keyIndex < 0) throw new Error(`Key column '${keyCol}' not found in ${tabName} headers`);

  const colLetter = String.fromCharCode("A".charCodeAt(0) + keyIndex);
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!${colLetter}2:${colLetter}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values: any[][] = resp.data.values || [];
  for (let i = 0; i < values.length; i++) {
    const v = String(values[i]?.[0] ?? "").trim();
    if (v === keyVal) return i + 2;
  }
  return null;
}

async function appendRows(
  sheets: any,
  spreadsheetId: string,
  tabName: string,
  rowsAsArrays: string[][]
) {
  if (!rowsAsArrays.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rowsAsArrays },
  });
}

async function updateRow(
  sheets: any,
  spreadsheetId: string,
  tabName: string,
  rowNumber: number,
  rowAsArray: string[]
) {
  const endColLetter = String.fromCharCode("A".charCodeAt(0) + rowAsArray.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A${rowNumber}:${endColLetter}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowAsArray] },
  });
}

async function main() {
  const tabName = process.argv[2];
  const csvPath = process.argv[3];
  const mode = (process.argv[4] as Mode) || "append";
  const keyCol = process.argv[5] || "";

  if (!tabName || !csvPath) {
    console.error("Usage:");
    console.error("  npx tsx server/scripts/sheetImport.ts <TAB_NAME> <CSV_PATH> [append|upsert] [KEY_COLUMN]");
    process.exit(1);
  }
  if (mode === "upsert" && !keyCol) {
    throw new Error("UPSERT mode requires KEY_COLUMN as 5th argument.");
  }

  const csv = fs.readFileSync(path.resolve(csvPath), "utf8");
  const parsed = parseCsv(csv);

  const { sheets, spreadsheetId } = await getSheetsClient();
  const tabHeader = await getTabHeader(sheets, spreadsheetId, tabName);

  const rowsAsArrays = parsed.rows.map(r => {
    return tabHeader.map(h => String(r[h] ?? "").trim());
  });

  if (mode === "append") {
    await appendRows(sheets, spreadsheetId, tabName, rowsAsArrays);
    console.log(`✅ Appended ${rowsAsArrays.length} row(s) to ${tabName}`);
    return;
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const keyVal = String(parsed.rows[i][keyCol] ?? "").trim();
    if (!keyVal) {
      console.log(`⚠️ Row ${i + 2} missing key '${keyCol}', skipping.`);
      continue;
    }
    const existingRow = await findRowByKey(sheets, spreadsheetId, tabName, tabHeader, keyCol, keyVal);
    if (existingRow) {
      await updateRow(sheets, spreadsheetId, tabName, existingRow, rowsAsArrays[i]);
      console.log(`🧩 Updated ${tabName} row ${existingRow} where ${keyCol}=${keyVal}`);
    } else {
      await appendRows(sheets, spreadsheetId, tabName, [rowsAsArrays[i]]);
      console.log(`➕ Inserted new row into ${tabName} where ${keyCol}=${keyVal}`);
    }
  }

  console.log(`✅ Upsert complete for ${tabName}`);
}

main().catch(err => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
