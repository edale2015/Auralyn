/**
 * scripts/engine-coverage-audit.ts
 *
 * Audits engine coverage and structural gaps.
 *
 * Outputs:
 *   data/complaints/reports/engine_coverage_audit.csv
 *   data/complaints/reports/dead_rules.csv
 *   data/complaints/reports/unused_red_flags.csv
 *   data/complaints/reports/missing_question_tokens.csv
 *
 * Usage:
 *   npx tsx scripts/engine-coverage-audit.ts
 *   npx tsx scripts/engine-coverage-audit.ts --harness-json data/complaints/reports/harness_results.json
 *   npx tsx scripts/engine-coverage-audit.ts --harness-csv data/complaints/reports/harness_results.csv
 */

import fs from "fs";
import path from "path";

type Args = {
  harnessJson?: string;
  harnessCsv?: string;
};

type HarnessRow = {
  cc_id: string;
  passed?: boolean;
  winning_cluster_id?: string;
  triggered_red_flags?: string[];
  disposition?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--harness-json") args.harnessJson = argv[++i];
    else if (argv[i] === "--harness-csv") args.harnessCsv = argv[++i];
  }
  return args;
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

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = row[h] ?? "";
          if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(",")
    );
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function tokenizeExpr(expr: string): string[] {
  const s = (expr ?? "").toUpperCase();
  const found = new Set<string>();
  const re = /\b[A-Z][A-Z0-9_]{1,40}\b/g;
  for (const m of s.matchAll(re)) {
    const tok = m[0];
    if (
      ["ANY", "ALL", "NOT", "TRUE", "FALSE", "ER", "URGENT", "URGENT_CARE", "PCP", "SELF_CARE", "ER_SEND", "ESCALATE"].includes(tok)
    ) continue;
    if (/^\d+$/.test(tok)) continue;
    found.add(tok);
  }
  return [...found];
}

function loadHarnessRows(root: string, args: Args): HarnessRow[] {
  const jsonPath =
    args.harnessJson
      ? path.isAbsolute(args.harnessJson) ? args.harnessJson : path.join(root, args.harnessJson)
      : path.join(root, "data", "complaints", "reports", "harness_results.json");

  const csvPath =
    args.harnessCsv
      ? path.isAbsolute(args.harnessCsv) ? args.harnessCsv : path.join(root, args.harnessCsv)
      : path.join(root, "data", "complaints", "reports", "harness_results.csv");

  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (Array.isArray(raw)) return raw as HarnessRow[];
    if (Array.isArray(raw.results)) return raw.results as HarnessRow[];
  }

  if (fs.existsSync(csvPath)) {
    const { rows } = readCsv(csvPath);
    return rows.map((r) => ({
      cc_id: r.cc_id || r.CC_ID || r.ccId || "",
      passed: (r.passed || r.PASSED || "").toString().toLowerCase() === "true",
      winning_cluster_id: r.winning_cluster_id || r.WINNING_CLUSTER_ID || r.cluster_id || "",
      disposition: r.disposition || r.DISPOSITION || "",
      triggered_red_flags: (r.triggered_red_flags || r.TRIGGERED_RED_FLAGS || "")
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean)
    }));
  }

  return [];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const reportsDir = path.join(root, "data", "complaints", "reports");

  const csrPath = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");
  const rfPath = path.join(root, "server", "data", "csv", "RED_FLAG_RULES.csv");
  const qPath = path.join(root, "server", "data", "csv", "CORE_QUESTIONS.csv");
  const dispPath = path.join(root, "server", "data", "csv", "DISPOSITION_RULES.csv");

  const csr = readCsv(csrPath);
  const rf = readCsv(rfPath);
  const qs = readCsv(qPath);
  const disp = readCsv(dispPath);
  const harness = loadHarnessRows(root, args);

  const testsByCc = new Map<string, HarnessRow[]>();
  for (const hr of harness) {
    const cc = (hr.cc_id ?? "").trim();
    if (!cc) continue;
    if (!testsByCc.has(cc)) testsByCc.set(cc, []);
    testsByCc.get(cc)!.push(hr);
  }

  const questionTokensByCc = new Map<string, Set<string>>();
  for (const r of qs.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const qid = (r.Q_ID ?? "").trim().toUpperCase();
    if (!cc || !qid) continue;
    const parts = qid.split("_");
    const tok = parts.length >= 3 ? parts.slice(2).join("_") : qid;
    if (!questionTokensByCc.has(cc)) questionTokensByCc.set(cc, new Set());
    questionTokensByCc.get(cc)!.add(tok);
  }

  const clusterWinCounts = new Map<string, number>();
  const rfFireCounts = new Map<string, number>();
  const dispCounts = new Map<string, Map<string, number>>();

  for (const hr of harness) {
    const cc = (hr.cc_id ?? "").trim();
    if (!cc) continue;

    const winCl = (hr.winning_cluster_id ?? "").trim();
    if (winCl) {
      const key = `${cc}||${winCl}`;
      clusterWinCounts.set(key, (clusterWinCounts.get(key) ?? 0) + 1);
    }

    for (const rfid of hr.triggered_red_flags ?? []) {
      const key = `${cc}||${rfid}`;
      rfFireCounts.set(key, (rfFireCounts.get(key) ?? 0) + 1);
    }

    const d = (hr.disposition ?? "").trim();
    if (d) {
      if (!dispCounts.has(cc)) dispCounts.set(cc, new Map());
      const m = dispCounts.get(cc)!;
      m.set(d, (m.get(d) ?? 0) + 1);
    }
  }

  const ccSet = new Set<string>();
  for (const r of csr.rows) if (r.CC_ID) ccSet.add(r.CC_ID);
  for (const r of rf.rows) if (r.CC_ID) ccSet.add(r.CC_ID);
  for (const r of disp.rows) if (r.CC_ID) ccSet.add(r.CC_ID);

  const auditRows: Record<string, string>[] = [];
  const deadRuleRows: Record<string, string>[] = [];
  const unusedRfRows: Record<string, string>[] = [];
  const missingQRows: Record<string, string>[] = [];

  for (const cc of [...ccSet].sort()) {
    const csrRows = csr.rows.filter((r) => r.CC_ID === cc);
    const rfRows = rf.rows.filter((r) => r.CC_ID === cc);
    const dispRows = disp.rows.filter((r) => r.CC_ID === cc);
    const tests = testsByCc.get(cc) ?? [];
    const totalTests = tests.length;

    let winningClusters = 0;
    const clusterIds = new Set<string>(csrRows.map((r) => r.CLUSTER_ID).filter(Boolean));
    for (const cl of clusterIds) {
      if ((clusterWinCounts.get(`${cc}||${cl}`) ?? 0) > 0) winningClusters++;
    }

    const deadClusters = [...clusterIds].filter((cl) => (clusterWinCounts.get(`${cc}||${cl}`) ?? 0) === 0);

    const dispMap = dispCounts.get(cc) ?? new Map<string, number>();
    let dominantDisposition = "";
    let dominantDispositionRate = 0;
    if (totalTests > 0) {
      for (const [d, n] of dispMap.entries()) {
        const rate = n / totalTests;
        if (rate > dominantDispositionRate) {
          dominantDispositionRate = rate;
          dominantDisposition = d;
        }
      }
    }

    const neededTokens = new Set<string>();
    for (const r of csrRows) for (const t of tokenizeExpr(r.WHEN_EXPR ?? "")) neededTokens.add(t);
    for (const r of rfRows) for (const t of tokenizeExpr((r.TRIGGER_EXPR ?? r.WHEN_EXPR ?? ""))) neededTokens.add(t);
    for (const r of dispRows) for (const t of tokenizeExpr(r.WHEN_EXPR ?? "")) neededTokens.add(t);

    const asked = questionTokensByCc.get(cc) ?? new Set<string>();
    const missingTokens = [...neededTokens].filter((t) => !asked.has(t));

    auditRows.push({
      CC_ID: cc,
      TOTAL_TESTS: String(totalTests),
      CSR_ROWS: String(csrRows.length),
      CLUSTERS: String(clusterIds.size),
      CLUSTERS_THAT_WIN: String(winningClusters),
      DEAD_CLUSTERS: String(deadClusters.length),
      RED_FLAG_ROWS: String(rfRows.length),
      DISPOSITION_ROWS: String(dispRows.length),
      DOMINANT_DISPOSITION: dominantDisposition,
      DOMINANT_DISPOSITION_RATE: dominantDispositionRate.toFixed(3),
      MISSING_QUESTION_TOKENS: String(missingTokens.length)
    });

    for (const cl of deadClusters) {
      deadRuleRows.push({
        CC_ID: cc,
        CLUSTER_ID: cl,
        FIRE_COUNT: String(clusterWinCounts.get(`${cc}||${cl}`) ?? 0),
        TOTAL_TESTS: String(totalTests)
      });
    }

    for (const r of rfRows) {
      const rfid = r.RF_ID ?? r.RULE_ID ?? r.ID ?? "";
      if (!rfid) continue;
      const fired = rfFireCounts.get(`${cc}||${rfid}`) ?? 0;
      if (fired === 0) {
        unusedRfRows.push({
          CC_ID: cc,
          RF_ID: rfid,
          FIRE_COUNT: "0",
          TOTAL_TESTS: String(totalTests),
          TRIGGER_EXPR: r.TRIGGER_EXPR ?? r.WHEN_EXPR ?? ""
        });
      }
    }

    for (const tok of missingTokens) {
      missingQRows.push({
        CC_ID: cc,
        TOKEN: tok
      });
    }
  }

  writeCsv(path.join(reportsDir, "engine_coverage_audit.csv"), [
    "CC_ID",
    "TOTAL_TESTS",
    "CSR_ROWS",
    "CLUSTERS",
    "CLUSTERS_THAT_WIN",
    "DEAD_CLUSTERS",
    "RED_FLAG_ROWS",
    "DISPOSITION_ROWS",
    "DOMINANT_DISPOSITION",
    "DOMINANT_DISPOSITION_RATE",
    "MISSING_QUESTION_TOKENS"
  ], auditRows);

  writeCsv(path.join(reportsDir, "dead_rules.csv"), [
    "CC_ID", "CLUSTER_ID", "FIRE_COUNT", "TOTAL_TESTS"
  ], deadRuleRows);

  writeCsv(path.join(reportsDir, "unused_red_flags.csv"), [
    "CC_ID", "RF_ID", "FIRE_COUNT", "TOTAL_TESTS", "TRIGGER_EXPR"
  ], unusedRfRows);

  writeCsv(path.join(reportsDir, "missing_question_tokens.csv"), [
    "CC_ID", "TOKEN"
  ], missingQRows);

  console.log("engine-coverage-audit complete");
  console.log(`Coverage rows: ${auditRows.length}`);
  console.log(`Dead clusters: ${deadRuleRows.length}`);
  console.log(`Unused red flags: ${unusedRfRows.length}`);
  console.log(`Missing question tokens: ${missingQRows.length}`);
}

main();
