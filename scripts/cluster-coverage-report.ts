import fs from "node:fs";
import path from "node:path";

const CSV_DIR = path.resolve(process.cwd(), "server/data/csv");
const TESTS_DIR = path.resolve(process.cwd(), "tests/cases");
const ANALYTICS_PATH = path.join(CSV_DIR, "CASE_ANALYTICS_LOG.csv");
const OUT_PATH = path.resolve(process.cwd(), "data/complaints/cluster_heatmap.csv");

function parseCsv(filePath: string): Array<Record<string, string>> {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? "").trim(); });
    return row;
  });
}

function loadTestClusters(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!fs.existsSync(TESTS_DIR)) return map;
  for (const dir of fs.readdirSync(TESTS_DIR)) {
    const ccDir = path.join(TESTS_DIR, dir);
    if (!fs.statSync(ccDir).isDirectory()) continue;
    for (const f of fs.readdirSync(ccDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const test = JSON.parse(fs.readFileSync(path.join(ccDir, f), "utf8"));
        const ccId = test.cc_id ?? dir;
        const cluster = test.expect?.cluster;
        if (cluster) {
          if (!map.has(ccId)) map.set(ccId, new Set());
          map.get(ccId)!.add(cluster);
        }
      } catch {}
    }
  }
  return map;
}

const csrRows = parseCsv(path.join(CSV_DIR, "CLUSTER_SCORING_RULES.csv"));
const analyticsRows = parseCsv(ANALYTICS_PATH);
const testClusters = loadTestClusters();

const ccIds = [...new Set(csrRows.map(r => r.CC_ID))].sort();

const analyticsClustersByCC = new Map<string, Set<string>>();
for (const r of analyticsRows) {
  const cc = r.CC_ID;
  const cl = r.TOP_CLUSTER;
  if (cc && cl) {
    if (!analyticsClustersByCC.has(cc)) analyticsClustersByCC.set(cc, new Set());
    analyticsClustersByCC.get(cc)!.add(cl);
  }
}

const outLines: string[] = [
  "CC_ID,CSR_ROWS,CLUSTERS,ACTIVE_RULES,INERT_RULES,FIRED_IN_TESTS,FIRED_IN_ANALYTICS",
];

for (const cc of ccIds) {
  const rules = csrRows.filter(r => r.CC_ID === cc);
  const clusters = new Set(rules.map(r => r.CLUSTER_ID));
  const active = rules.filter(r => r.WHEN_EXPR !== "false" && r.POINTS !== "0" && r.POINTS !== "");
  const inert = rules.length - active.length;
  const firedTest = testClusters.get(cc)?.size ?? 0;
  const firedAnalytics = analyticsClustersByCC.get(cc)?.size ?? 0;

  outLines.push([
    cc,
    rules.length,
    clusters.size,
    active.length,
    inert,
    firedTest,
    firedAnalytics,
  ].join(","));
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, outLines.join("\n") + "\n", "utf8");

console.log(`\n=== Cluster Coverage Heatmap ===`);
console.log(`Complaints: ${ccIds.length}`);
console.log(`Total CSR rows: ${csrRows.length}`);
console.log(`Wrote: ${OUT_PATH}`);

const neverFiredInTests = ccIds.filter(cc => (testClusters.get(cc)?.size ?? 0) === 0);
if (neverFiredInTests.length > 0) {
  console.log(`\nComplaints with NO cluster coverage in tests (${neverFiredInTests.length}):`);
  neverFiredInTests.forEach(cc => console.log(`  - ${cc}`));
}

const highInert = ccIds.filter(cc => {
  const rules = csrRows.filter(r => r.CC_ID === cc);
  const inert = rules.filter(r => r.WHEN_EXPR === "false" || r.POINTS === "0" || r.POINTS === "");
  return inert.length > rules.length * 0.5 && rules.length > 3;
});
if (highInert.length > 0) {
  console.log(`\nComplaints with >50% inert rules (${highInert.length}):`);
  highInert.forEach(cc => {
    const rules = csrRows.filter(r => r.CC_ID === cc);
    const inert = rules.filter(r => r.WHEN_EXPR === "false" || r.POINTS === "0" || r.POINTS === "");
    console.log(`  - ${cc}: ${inert.length}/${rules.length} inert`);
  });
}
