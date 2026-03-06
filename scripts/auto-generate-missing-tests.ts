/**
 * scripts/auto-generate-missing-tests.ts
 *
 * Generate draft missing golden tests for dead clusters.
 *
 * Reads:
 *   data/complaints/reports/dead_rules.csv
 *   server/data/csv/CLUSTER_SCORING_RULES.csv
 *
 * Writes:
 *   data/complaints/reports/auto_generated_missing_tests.json
 *
 * Usage:
 *   npx tsx scripts/auto-generate-missing-tests.ts
 *   npx tsx scripts/auto-generate-missing-tests.ts --limit 50
 */

import fs from "fs";
import path from "path";

type Args = {
  limit: number;
};

function parseArgs(argv: string[]): Args {
  let limit = 50;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i] ?? "50");
  }
  return { limit };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath)) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }
  return { headers, rows };
}

function extractConstraints(expr: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const s = (expr ?? "").toUpperCase();

  for (const m of s.matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*(TRUE|FALSE)\b/g)) {
    out[m[1]] = m[2] === "TRUE";
  }

  for (const m of s.matchAll(/\b([A-Z][A-Z0-9_]*)\s*(>=|>|<=|<)\s*(-?\d+(?:\.\d+)?)\b/g)) {
    const token = m[1];
    const op = m[2];
    const num = Number(m[3]);

    if (op === ">") out[token] = num + 1;
    else if (op === ">=") out[token] = num;
    else if (op === "<") out[token] = num - 1;
    else if (op === "<=") out[token] = num;
  }

  return out;
}

function mergeConstraints(a: Record<string, any>, b: Record<string, any>) {
  return { ...a, ...b };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const deadRulesPath = path.join(root, "data", "complaints", "reports", "dead_rules.csv");
  const csrPath = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");
  const outPath = path.join(root, "data", "complaints", "reports", "auto_generated_missing_tests.json");

  const dead = readCsv(deadRulesPath);
  const csr = readCsv(csrPath);

  const items: any[] = [];

  for (const row of dead.rows.slice(0, args.limit)) {
    const cc = row.CC_ID;
    const cl = row.CLUSTER_ID;

    const clusterRules = csr.rows.filter((r) => r.CC_ID === cc && r.CLUSTER_ID === cl);
    if (!clusterRules.length) continue;

    let syntheticInput: Record<string, any> = {};
    for (const r of clusterRules) {
      syntheticInput = mergeConstraints(syntheticInput, extractConstraints(r.WHEN_EXPR ?? ""));
    }

    items.push({
      complaint_id: cc,
      target_cluster_id: cl,
      synthetic_answers: syntheticInput,
      expected: {
        winning_cluster_id: cl
      },
      source_rule_ids: clusterRules.map((r) => r.RULE_ID ?? "")
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    count: items.length,
    tests: items
  }, null, 2) + "\n", "utf8");

  console.log("auto-generate-missing-tests complete");
  console.log(`Draft tests: ${items.length}`);
  console.log(`Wrote: ${outPath}`);
}

main();
