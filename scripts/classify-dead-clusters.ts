/**
 * scripts/classify-dead-clusters.ts
 *
 * Classifies dead clusters into likely categories.
 *
 * Inputs:
 *   data/complaints/reports/dead_rules.csv
 *   server/data/csv/CLUSTER_SCORING_RULES.csv
 *   data/complaints/runtime/engine_runtime_audit.csv (optional)
 *
 * Output:
 *   data/complaints/reports/dead_cluster_classification.csv
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
  const deadPath = path.join(root, "data", "complaints", "reports", "dead_rules.csv");
  const csrPath = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");
  const runtimePath = path.join(root, "data", "complaints", "runtime", "engine_runtime_audit.csv");
  const outPath = path.join(root, "data", "complaints", "reports", "dead_cluster_classification.csv");

  const dead = readCsv(deadPath);
  const csr = readCsv(csrPath);
  const runtime = readCsv(runtimePath);

  const runtimeFire = new Map<string, number>();
  for (const r of runtime.rows) {
    const cc = r.CC_ID ?? r.cc_id ?? "";
    const fired = (r.FIRED_CLUSTER_IDS ?? r.fired_cluster_ids ?? "").split("|").filter(Boolean);
    for (const cl of fired) {
      const k = `${cc}||${cl}`;
      runtimeFire.set(k, (runtimeFire.get(k) ?? 0) + 1);
    }
  }

  const out: Record<string,string>[] = [];

  for (const row of dead.rows) {
    const cc = row.CC_ID ?? "";
    const cl = row.CLUSTER_ID ?? "";
    const totalTests = Number(row.TOTAL_TESTS ?? "0") || 0;
    const rules = csr.rows.filter((r) => r.CC_ID === cc && r.CLUSTER_ID === cl);
    const prodFire = runtimeFire.get(`${cc}||${cl}`) ?? 0;

    let classification = "UNKNOWN";
    let reason = "";

    if (prodFire > 0) {
      classification = "NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD";
      reason = `runtime_fire_count=${prodFire}`;
    } else if (totalTests < 5) {
      classification = "UNDER_TESTED";
      reason = `only ${totalTests} tests`;
    } else if (rules.length >= 3) {
      classification = "LIKELY_OVERSPECIFIED";
      reason = `${rules.length} rules, zero wins`;
    } else if (rules.some((r) => (r.POINTS ?? "") === "1")) {
      classification = "LIKELY_SHADOWED";
      reason = `low-point cluster likely loses to stronger clusters`;
    }

    out.push({
      CC_ID: cc,
      CLUSTER_ID: cl,
      TOTAL_TESTS: String(totalTests),
      PROD_FIRE_COUNT: String(prodFire),
      RULE_COUNT: String(rules.length),
      CLASSIFICATION: classification,
      REASON: reason
    });
  }

  writeCsv(outPath, ["CC_ID","CLUSTER_ID","TOTAL_TESTS","PROD_FIRE_COUNT","RULE_COUNT","CLASSIFICATION","REASON"], out);
  console.log(`Wrote ${outPath}`);
}

main();
