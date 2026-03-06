/**
 * scripts/priority-refinement-report.ts
 *
 * Analyze DX_CANDIDATES.csv for ranking instability / benign dominance.
 *
 * Output:
 *   data/complaints/reports/priority_refinement_report.csv
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
  const inPath = path.join(root, "server", "data", "csv", "DX_CANDIDATES.csv");
  const csv = readCsv(inPath);

  const byCc = new Map<string, Record<string,string>[]>();
  for (const r of csv.rows) {
    const cc = r.CC_ID ?? "";
    if (!cc) continue;
    if (!byCc.has(cc)) byCc.set(cc, []);
    byCc.get(cc)!.push(r);
  }

  const out: Record<string,string>[] = [];

  for (const [cc, rows] of byCc.entries()) {
    rows.sort((a, b) => Number(b.BASE_SCORE ?? 0) - Number(a.BASE_SCORE ?? 0));
    const top = rows.slice(0, 5);
    const top1 = Number(top[0]?.BASE_SCORE ?? 0);
    const top2 = Number(top[1]?.BASE_SCORE ?? 0);
    const gap = top1 - top2;

    const benignTop = (top[0]?.BEST_CLUSTER_ID ?? "").endsWith("_BENIGN");
    const tieish = top.filter((r) => Math.abs(Number(r.BASE_SCORE ?? 0) - top1) < 0.01).length;

    let flag = "";
    if (benignTop) flag += "BENIGN_TOP;";
    if (gap < 5) flag += "LOW_GAP;";
    if (tieish >= 2) flag += "TIES;";

    if (!flag) continue;

    out.push({
      CC_ID: cc,
      TOP1_DX: top[0]?.DX_ID ?? "",
      TOP1_SCORE: String(top1),
      TOP2_DX: top[1]?.DX_ID ?? "",
      TOP2_SCORE: String(top2),
      SCORE_GAP: String(gap),
      FLAGS: flag.replace(/;$/, "")
    });
  }

  writeCsv(path.join(root, "data", "complaints", "reports", "priority_refinement_report.csv"),
    ["CC_ID","TOP1_DX","TOP1_SCORE","TOP2_DX","TOP2_SCORE","SCORE_GAP","FLAGS"], out);

  console.log(`priority refinement report written (${out.length} flagged complaints)`);
}

main();
