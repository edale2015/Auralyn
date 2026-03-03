import fs from "node:fs";
import path from "node:path";

const STRESS_PATH = "stress_results.json";
const TARGETS_PATH = "server/data/csv/CALIBRATION_TARGETS.csv";
const OUT_DIR = "artifacts";
const OUT_PATH = path.join(OUT_DIR, "calibration_report.json");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim().replace(/^"|"$/g, ""));
}

type Target = {
  complaint: string;
  emerg: number;
  review: number;
  unclassified: number;
  churn: number;
  notes: string;
};

function loadTargets(): { defaults: Target; overrides: Map<string, Target> } {
  const text = fs.readFileSync(TARGETS_PATH, "utf8").trim();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const header = splitCsvLine(lines[0]);

  const idx = (k: string) => header.indexOf(k);
  const overrides = new Map<string, Target>();

  let defaults: Target | null = null;

  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const complaint = c[idx("Complaint_Slug")];
    const t: Target = {
      complaint,
      emerg: Number(c[idx("TargetEmergRate")] ?? "0"),
      review: Number(c[idx("TargetNeedsReviewRate")] ?? "0"),
      unclassified: Number(c[idx("MaxUnclassifiedRate")] ?? "0"),
      churn: Number(c[idx("MaxWinnerChurnRate")] ?? "1"),
      notes: c[idx("Notes")] ?? "",
    };
    if (complaint === "*") defaults = t;
    else overrides.set(complaint, t);
  }

  if (!defaults) {
    defaults = { complaint: "*", emerg: 0.1, review: 0.35, unclassified: 0.01, churn: 0.15, notes: "default" };
  }
  return { defaults, overrides };
}

function main() {
  if (!fs.existsSync(STRESS_PATH)) {
    console.error(`Missing ${STRESS_PATH}. Run simulate-stress first.`);
    process.exit(1);
  }
  ensureDir(OUT_DIR);

  const stress = JSON.parse(fs.readFileSync(STRESS_PATH, "utf8"));
  const results: any[] = stress.results ?? [];

  if (results.length === 0) {
    console.error("stress_results.json has no 'results' array. Re-run stress sim to generate per-result data.");
    process.exit(1);
  }

  const { defaults, overrides } = loadTargets();

  const agg: Record<string, { total: number; emerg: number; review: number; unclassified: number; clusters: string[] }> = {};

  for (const r of results) {
    const c = r.cc_id ?? r.complaint ?? "unknown";
    agg[c] ??= { total: 0, emerg: 0, review: 0, unclassified: 0, clusters: [] };
    agg[c].total++;

    if (r.disposition === "er_send") agg[c].emerg++;

    const needsReview =
      (typeof r.needsReview === "boolean" ? r.needsReview :
        (r.disposition === "er_send" || r.rf_gate === "ESCALATE" || r.rf_gate === "ER_SEND" || (r.rf_fired?.length ?? 0) > 0));
    if (needsReview) agg[c].review++;

    const cluster = String(r.cluster ?? "");
    if (!cluster || cluster === "UNCLASSIFIED" || cluster === "ERROR") agg[c].unclassified++;
    if (cluster) agg[c].clusters.push(cluster);
  }

  const rows = Object.entries(agg).map(([complaint, m]) => {
    const t = overrides.get(complaint) ?? defaults;
    const emergRate = m.total ? m.emerg / m.total : 0;
    const reviewRate = m.total ? m.review / m.total : 0;
    const unclassRate = m.total ? m.unclassified / m.total : 0;

    let churnRate = 0;
    if (m.clusters.length >= 2) {
      const mostCommon = [...new Map(m.clusters.reduce((acc, cl) => {
        acc.set(cl, (acc.get(cl) ?? 0) + 1);
        return acc;
      }, new Map<string, number>())).entries()].sort((a, b) => b[1] - a[1])[0];
      const winnerCount = mostCommon[1];
      churnRate = 1 - (winnerCount / m.clusters.length);
    }

    return {
      complaint,
      total: m.total,
      emergRate: +emergRate.toFixed(4),
      reviewRate: +reviewRate.toFixed(4),
      unclassRate: +unclassRate.toFixed(4),
      churnRate: +churnRate.toFixed(4),
      targetEmerg: t.emerg,
      targetReview: t.review,
      maxUnclass: t.unclassified,
      maxChurn: t.churn,
      deltaEmerg: +(emergRate - t.emerg).toFixed(4),
      deltaReview: +(reviewRate - t.review).toFixed(4),
      deltaUnclass: +(unclassRate - t.unclassified).toFixed(4),
      deltaChurn: +(churnRate - t.churn).toFixed(4),
      overTriaged: emergRate > t.emerg,
      underTriaged: emergRate < t.emerg * 0.5,
      churnViolation: churnRate > t.churn,
      notes: t.notes,
    };
  });

  rows.sort((a, b) => {
    const sa = Math.abs(a.deltaEmerg) + Math.abs(a.deltaReview) + Math.abs(a.deltaUnclass);
    const sb = Math.abs(b.deltaEmerg) + Math.abs(b.deltaReview) + Math.abs(b.deltaUnclass);
    return sb - sa;
  });

  const overTriagedCount = rows.filter(r => r.overTriaged).length;
  const underTriagedCount = rows.filter(r => r.underTriaged).length;
  const unclassViolations = rows.filter(r => r.deltaUnclass > 0).length;
  const churnViolations = rows.filter(r => r.churnViolation).length;

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      complaints: rows.length,
      N: results.length,
      overTriaged: overTriagedCount,
      underTriaged: underTriagedCount,
      unclassViolations,
      churnViolations,
    },
    topDeltas: rows.slice(0, 20),
    all: rows,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`Calibration report: ${OUT_PATH}`);
  console.log(`N=${results.length}  complaints=${rows.length}  overTriaged=${overTriagedCount}  underTriaged=${underTriagedCount}  unclassViolations=${unclassViolations}  churnViolations=${churnViolations}\n`);
  console.log("Top calibration deltas:");
  for (const r of rows.slice(0, 15)) {
    const flags: string[] = [];
    if (r.overTriaged) flags.push("OVER");
    if (r.underTriaged) flags.push("UNDER");
    if (r.deltaUnclass > 0) flags.push("UNCLASS");
    if (r.churnViolation) flags.push("CHURN");
    const tag = flags.length ? ` [${flags.join(",")}]` : "";
    console.log(
      `  ${r.complaint.padEnd(40)} N=${String(r.total).padStart(3)} emerg=${r.emergRate.toFixed(2)}(t${r.targetEmerg}) review=${r.reviewRate.toFixed(2)}(t${r.targetReview}) churn=${r.churnRate.toFixed(2)}(max${r.maxChurn})${tag}`
    );
  }
}

main();
