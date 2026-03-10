import * as fs from "fs/promises";
import * as path from "path";

export type CsvRow = Record<string, string>;

const CSV_BASE_DIR = path.resolve(process.cwd(), "server/data/csv");

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((v) => v.trim());
}

function normalizeHeader(header: string): string {
  return header.trim();
}

export async function loadCsvTable(fileName: string): Promise<CsvRow[]> {
  const filePath = path.join(CSV_BASE_DIR, fileName);
  const raw = await fs.readFile(filePath, "utf8");

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: CsvRow = {};

    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? "").trim();
    });

    rows.push(row);
  }

  return rows;
}

export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getFirstValue(row: CsvRow, candidateHeaders: string[]): string {
  const normalizedMap = new Map<string, string>();

  for (const [k, v] of Object.entries(row)) {
    normalizedMap.set(normalizeKey(k), v);
  }

  for (const header of candidateHeaders) {
    const val = normalizedMap.get(normalizeKey(header));
    if (val !== undefined && val !== "") return val;
  }

  return "";
}

export function toBool(val: string): boolean {
  const s = (val || "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "y";
}

export function toNumber(val: string, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
