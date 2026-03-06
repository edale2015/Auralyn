/**
 * scripts/close-the-loop-report.ts
 *
 * Consolidated report for the self-improving engine loop.
 *
 * Reads, when present:
 *   data/complaints/reports/engine_coverage_audit.csv
 *   data/complaints/reports/dead_rules.csv
 *   data/complaints/reports/dead_cluster_classification.csv
 *   data/complaints/reports/auto_generated_missing_tests.json
 *   data/complaints/reports/generated_golden_tests.jsonl
 *   data/complaints/reports/approved_generated_golden_tests.jsonl
 *   data/complaints/reports/harness_manifest.json
 *   data/complaints/reports/runtime_cluster_coverage.csv
 *   data/complaints/reports/runtime_complaint_summary.csv
 *   data/complaints/reports/priority_refinement_report.csv
 *   data/complaints/reports/rule_contradictions.csv
 *   data/complaints/reports/phase_readiness_report.json
 *
 * Writes:
 *   data/complaints/reports/close_the_loop_report.json
 *   data/complaints/reports/close_the_loop_report.csv
 *
 * Usage:
 *   npx tsx scripts/close-the-loop-report.ts
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

function readJson(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines = [headers.join(",")];
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

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function main() {
  const root = process.cwd();
  const reportsDir = path.join(root, "data", "complaints", "reports");

  const engineCoverage = readCsv(path.join(reportsDir, "engine_coverage_audit.csv"));
  const deadRules = readCsv(path.join(reportsDir, "dead_rules.csv"));
  const deadClass = readCsv(path.join(reportsDir, "dead_cluster_classification.csv"));
  const autoMissing = readJson(path.join(reportsDir, "auto_generated_missing_tests.json"));
  const generatedGolden = readJsonl(path.join(reportsDir, "generated_golden_tests.jsonl"));
  const approvedGolden = readJsonl(path.join(reportsDir, "approved_generated_golden_tests.jsonl"));
  const harnessManifest = readJson(path.join(reportsDir, "harness_manifest.json"));
  const runtimeCluster = readCsv(path.join(reportsDir, "runtime_cluster_coverage.csv"));
  const runtimeComplaint = readCsv(path.join(reportsDir, "runtime_complaint_summary.csv"));
  const priorityRefinement = readCsv(path.join(reportsDir, "priority_refinement_report.csv"));
  const contradictions = readCsv(path.join(reportsDir, "rule_contradictions.csv"));
  const readiness = readJson(path.join(reportsDir, "phase_readiness_report.json"));

  const complaintIds = new Set<string>();

  for (const r of engineCoverage.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of deadRules.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of deadClass.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of runtimeCluster.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of runtimeComplaint.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of priorityRefinement.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of contradictions.rows) if (r.CC_ID) complaintIds.add(r.CC_ID);
  for (const r of generatedGolden) if (r.complaint_id) complaintIds.add(r.complaint_id);
  for (const r of approvedGolden) if (r.complaint_id) complaintIds.add(r.complaint_id);
  for (const r of autoMissing?.tests ?? []) if (r.complaint_id) complaintIds.add(r.complaint_id);
  for (const r of harnessManifest?.rows ?? []) if (r.complaint_id && r.file === "__TOTAL__") complaintIds.add(r.complaint_id);

  const summaryByComplaint: Record<string, any> = {};

  for (const cc of [...complaintIds].sort()) {
    const coverage = engineCoverage.rows.find((r) => r.CC_ID === cc);
    const dead = deadRules.rows.filter((r) => r.CC_ID === cc);
    const deadC = deadClass.rows.filter((r) => r.CC_ID === cc);
    const rtCl = runtimeCluster.rows.filter((r) => r.CC_ID === cc);
    const rtCc = runtimeComplaint.rows.find((r) => r.CC_ID === cc);
    const pr = priorityRefinement.rows.find((r) => r.CC_ID === cc);
    const contra = contradictions.rows.filter((r) => r.CC_ID === cc);
    const gen = generatedGolden.filter((r) => r.complaint_id === cc);
    const appr = approvedGolden.filter((r) => r.complaint_id === cc);
    const auto = (autoMissing?.tests ?? []).filter((r: any) => r.complaint_id === cc);
    const manifestTotal = (harnessManifest?.rows ?? []).find((r: any) => r.complaint_id === cc && r.file === "__TOTAL__");

    const classCounts = {
      UNDER_TESTED: deadC.filter((r) => r.CLASSIFICATION === "UNDER_TESTED").length,
      NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD: deadC.filter((r) => r.CLASSIFICATION === "NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD").length,
      LIKELY_OVERSPECIFIED: deadC.filter((r) => r.CLASSIFICATION === "LIKELY_OVERSPECIFIED").length,
      LIKELY_SHADOWED: deadC.filter((r) => r.CLASSIFICATION === "LIKELY_SHADOWED").length,
      UNKNOWN: deadC.filter((r) => r.CLASSIFICATION === "UNKNOWN").length
    };

    summaryByComplaint[cc] = {
      complaint_id: cc,
      total_tests: num(coverage?.TOTAL_TESTS),
      csr_rows: num(coverage?.CSR_ROWS),
      clusters: num(coverage?.CLUSTERS),
      dead_clusters: dead.length,
      dead_cluster_classes: classCounts,
      missing_question_tokens: num(coverage?.MISSING_QUESTION_TOKENS),
      dominant_disposition: coverage?.DOMINANT_DISPOSITION ?? "",
      dominant_disposition_rate: num(coverage?.DOMINANT_DISPOSITION_RATE),
      generated_missing_tests: auto.length,
      generated_golden_tests: gen.length,
      approved_generated_tests: appr.length,
      runtime_cluster_fires: rtCl.reduce((a, r) => a + num(r.FIRE_COUNT), 0),
      runtime_case_count: num(rtCc?.CASE_COUNT),
      runtime_cases_with_red_flags: num(rtCc?.CASES_WITH_RED_FLAGS),
      priority_flags: pr?.FLAGS ?? "",
      contradiction_count: contra.length,
      harness_total_tests_seen: num(manifestTotal?.test_count)
    };
  }

  const overall = {
    generated_at: new Date().toISOString(),
    complaints_seen: Object.keys(summaryByComplaint).length,
    total_dead_clusters: deadRules.rows.length,
    total_generated_missing_tests: num(autoMissing?.count ?? 0),
    total_generated_golden_tests: generatedGolden.length,
    total_approved_generated_tests: approvedGolden.length,
    total_priority_flags: priorityRefinement.rows.length,
    total_contradictions: contradictions.rows.length,
    runtime_cluster_rows: runtimeCluster.rows.length,
    runtime_complaint_rows: runtimeComplaint.rows.length,
    readiness: readiness
      ? {
          present_count: readiness.present_count ?? 0,
          missing_count: readiness.missing_count ?? 0
        }
      : null
  };

  const jsonOut = {
    overall,
    by_complaint: Object.values(summaryByComplaint)
  };

  const jsonPath = path.join(reportsDir, "close_the_loop_report.json");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2) + "\n", "utf8");

  const csvRows = Object.values(summaryByComplaint).map((r: any) => ({
    CC_ID: r.complaint_id,
    TOTAL_TESTS: String(r.total_tests),
    CSR_ROWS: String(r.csr_rows),
    CLUSTERS: String(r.clusters),
    DEAD_CLUSTERS: String(r.dead_clusters),
    UNDER_TESTED: String(r.dead_cluster_classes.UNDER_TESTED),
    NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD: String(r.dead_cluster_classes.NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD),
    LIKELY_OVERSPECIFIED: String(r.dead_cluster_classes.LIKELY_OVERSPECIFIED),
    LIKELY_SHADOWED: String(r.dead_cluster_classes.LIKELY_SHADOWED),
    MISSING_QUESTION_TOKENS: String(r.missing_question_tokens),
    DOMINANT_DISPOSITION: r.dominant_disposition,
    DOMINANT_DISPOSITION_RATE: String(r.dominant_disposition_rate),
    GENERATED_MISSING_TESTS: String(r.generated_missing_tests),
    GENERATED_GOLDEN_TESTS: String(r.generated_golden_tests),
    APPROVED_GENERATED_TESTS: String(r.approved_generated_tests),
    RUNTIME_CLUSTER_FIRES: String(r.runtime_cluster_fires),
    RUNTIME_CASE_COUNT: String(r.runtime_case_count),
    RUNTIME_CASES_WITH_RED_FLAGS: String(r.runtime_cases_with_red_flags),
    PRIORITY_FLAGS: r.priority_flags,
    CONTRADICTION_COUNT: String(r.contradiction_count),
    HARNESS_TOTAL_TESTS_SEEN: String(r.harness_total_tests_seen)
  }));

  const csvPath = path.join(reportsDir, "close_the_loop_report.csv");
  writeCsv(csvPath, [
    "CC_ID",
    "TOTAL_TESTS",
    "CSR_ROWS",
    "CLUSTERS",
    "DEAD_CLUSTERS",
    "UNDER_TESTED",
    "NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD",
    "LIKELY_OVERSPECIFIED",
    "LIKELY_SHADOWED",
    "MISSING_QUESTION_TOKENS",
    "DOMINANT_DISPOSITION",
    "DOMINANT_DISPOSITION_RATE",
    "GENERATED_MISSING_TESTS",
    "GENERATED_GOLDEN_TESTS",
    "APPROVED_GENERATED_TESTS",
    "RUNTIME_CLUSTER_FIRES",
    "RUNTIME_CASE_COUNT",
    "RUNTIME_CASES_WITH_RED_FLAGS",
    "PRIORITY_FLAGS",
    "CONTRADICTION_COUNT",
    "HARNESS_TOTAL_TESTS_SEEN"
  ], csvRows);

  console.log("close-the-loop report complete");
  console.log(`Complaints summarized: ${overall.complaints_seen}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);
}

main();
