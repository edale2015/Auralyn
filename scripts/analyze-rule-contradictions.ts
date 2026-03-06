/**
 * scripts/analyze-rule-contradictions.ts
 *
 * Detect obvious contradictions in WHEN/TRIGGER expressions.
 *
 * Inputs:
 *   server/data/csv/CLUSTER_SCORING_RULES.csv
 *   server/data/csv/RED_FLAG_RULES.csv
 *   server/data/csv/DISPOSITION_RULES.csv
 *
 * Output:
 *   data/complaints/reports/rule_contradictions.csv
 */

import fs from "fs";
import path from "path";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath)) return { headers: [] as string[], rows: [] as Record<string,string>[] };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string,string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: Record<string,string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }
  return { headers, rows };
}

function writeCsv(filePath: string, headers: string[], rows: Record<string,string>[]) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => {
      const v = row[h] ?? "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    }).join(","));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function detectContradictions(expr: string): string[] {
  const out: string[] = [];
  const s = (expr ?? "").toUpperCase();

  const eqMap = new Map<string, Set<string>>();
  for (const m of s.matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*(TRUE|FALSE)\b/g)) {
    const tok = m[1];
    const val = m[2];
    if (!eqMap.has(tok)) eqMap.set(tok, new Set());
    eqMap.get(tok)!.add(val);
  }
  for (const [tok, vals] of eqMap.entries()) {
    if (vals.has("TRUE") && vals.has("FALSE")) out.push(`${tok}=true AND ${tok}=false`);
  }

  const gt = new Map<string, number[]>();
  const lt = new Map<string, number[]>();
  for (const m of s.matchAll(/\b([A-Z][A-Z0-9_]*)\s*(>=|>|<=|<)\s*(-?\d+(?:\.\d+)?)\b/g)) {
    const tok = m[1];
    const op = m[2];
    const num = Number(m[3]);
    if (op === ">" || op === ">=") {
      if (!gt.has(tok)) gt.set(tok, []);
      gt.get(tok)!.push(num);
    } else {
      if (!lt.has(tok)) lt.set(tok, []);
      lt.get(tok)!.push(num);
    }
  }
  for (const tok of new Set([...gt.keys(), ...lt.keys()])) {
    const maxLower = Math.max(...(gt.get(tok) ?? [-Infinity]));
    const minUpper = Math.min(...(lt.get(tok) ?? [Infinity]));
    if (maxLower > minUpper) {
      out.push(`${tok} lower bound ${maxLower} exceeds upper bound ${minUpper}`);
    }
  }

  return out;
}

function main() {
  const root = process.cwd();
  const tables = [
    { name: "CLUSTER_SCORING_RULES", path: path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv"), exprCol: "WHEN_EXPR", idCol: "RULE_ID" },
    { name: "RED_FLAG_RULES", path: path.join(root, "server", "data", "csv", "RED_FLAG_RULES.csv"), exprCol: "TRIGGER_EXPR", idCol: "RF_ID" },
    { name: "DISPOSITION_RULES", path: path.join(root, "server", "data", "csv", "DISPOSITION_RULES.csv"), exprCol: "WHEN_EXPR", idCol: "DISP_RULE_ID" }
  ];

  const rowsOut: Record<string,string>[] = [];

  for (const t of tables) {
    const csv = readCsv(t.path);
    for (const row of csv.rows) {
      const expr = row[t.exprCol] ?? "";
      const problems = detectContradictions(expr);
      if (!problems.length) continue;

      rowsOut.push({
        TABLE: t.name,
        CC_ID: row.CC_ID ?? "",
        RULE_ID: row[t.idCol] ?? "",
        EXPR: expr,
        CONTRADICTIONS: problems.join(" | ")
      });
    }
  }

  const outPath = path.join(root, "data", "complaints", "reports", "rule_contradictions.csv");
  writeCsv(outPath, ["TABLE","CC_ID","RULE_ID","EXPR","CONTRADICTIONS"], rowsOut);
  console.log(`Wrote ${outPath} (${rowsOut.length} rows)`);
}

main();
