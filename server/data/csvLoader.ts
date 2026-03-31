/**
 * CSV Loader — DISABLED by default
 *
 * All clinical data now lives in Postgres KB tables.
 * Set ALLOW_CSV=true in environment to re-enable (emergency fallback only).
 *
 * Source of truth: kb_* tables (see knowledgeBaseAdminRoutes.ts)
 */

import fs from "fs";
import path from "path";

const CSV_ALLOWED = process.env.ALLOW_CSV === "true";

type SheetRow = Record<string, any>;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function loadCsvFile(filePath: string): SheetRow[] {
  if (!CSV_ALLOWED) {
    console.warn(`[CsvLoader] CSV loader is DISABLED. Set ALLOW_CSV=true to re-enable. Requested: ${filePath}`);
    return [];
  }

  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: SheetRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: SheetRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

const CSV_DIR = path.resolve(process.cwd(), "server/data/csv");

export function loadCsvTable(tableName: string): SheetRow[] | null {
  if (!CSV_ALLOWED) {
    console.warn(`[CsvLoader] CSV loader DISABLED — table '${tableName}' not loaded. Use KB tables instead.`);
    return null;
  }

  const filePath = path.join(CSV_DIR, `${tableName}.csv`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const rows = loadCsvFile(filePath);
    if (rows.length > 0) {
      console.log(`[CsvLoader] Loaded ${rows.length} rows from ${filePath}`);
    }
    return rows;
  } catch (err: any) {
    console.warn(`[CsvLoader] Failed to load ${filePath}: ${err.message}`);
    return null;
  }
}
