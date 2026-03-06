/**
 * scripts/runtime-audit-to-coverage.ts
 *
 * Convert runtime audit CSV into coverage summary CSVs.
 *
 * Inputs:
 *   data/complaints/runtime/engine_runtime_audit.csv
 *
 * Outputs:
 *   data/complaints/reports/runtime_cluster_coverage.csv
 *   data/complaints/reports/runtime_complaint_summary.csv
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

function main() {
  const root = process.cwd();
  const inPath = path.join(root, "data", "complaints", "runtime", "engine_runtime_audit.csv");
  const csv = readCsv(inPath);

  const clusterCounts = new Map<string, number>();
  const complaintCounts = new Map<string, { cases: number; redFlags: number }>();

  for (const r of csv.rows) {
    const cc = r.CC_ID ?? "";
    if (!cc) continue;

    if (!complaintCounts.has(cc)) complaintCounts.set(cc, { cases: 0, redFlags: 0 });
    complaintCounts.get(cc)!.cases += 1;

    const rf = (r.TRIGGERED_RED_FLAGS ?? "").split("|").filter(Boolean);
    if (rf.length) complaintCounts.get(cc)!.redFlags += 1;

    const fired = (r.FIRED_CLUSTER_IDS ?? "").split("|").filter(Boolean);
    for (const cl of fired) {
      const k = `${cc}||${cl}`;
      clusterCounts.set(k, (clusterCounts.get(k) ?? 0) + 1);
    }
  }

  const clusterRows: Record<string,string>[] = [];
  for (const [k, count] of clusterCounts.entries()) {
    const [cc, cl] = k.split("||");
    clusterRows.push({ CC_ID: cc, CLUSTER_ID: cl, FIRE_COUNT: String(count) });
  }

  const complaintRows: Record<string,string>[] = [];
  for (const [cc, v] of complaintCounts.entries()) {
    complaintRows.push({
      CC_ID: cc,
      CASE_COUNT: String(v.cases),
      CASES_WITH_RED_FLAGS: String(v.redFlags)
    });
  }

  writeCsv(path.join(root, "data", "complaints", "reports", "runtime_cluster_coverage.csv"),
    ["CC_ID","CLUSTER_ID","FIRE_COUNT"], clusterRows);

  writeCsv(path.join(root, "data", "complaints", "reports", "runtime_complaint_summary.csv"),
    ["CC_ID","CASE_COUNT","CASES_WITH_RED_FLAGS"], complaintRows);

  console.log("runtime coverage reports written");
}

main();
