import fs from "node:fs";
import path from "node:path";

type Issue = { kind: string; detail: string };

const OUT_DIR = "artifacts";
const OUT_PATH = path.join(OUT_DIR, "drift_report.json");

const PATH_REGISTRY = "server/data/csv/COMPLAINT_REGISTRY.csv";
const PATH_CLUSTER = "server/data/csv/CLUSTER_SCORING_RULES.csv";
const PATH_TEMPLATES = "server/data/csv/OUTPUT_TEMPLATES.csv";
const PATH_MICRO = "data/micro_packs.csv";

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

function parseCsv(p: string): { header: string[]; rows: string[][] } {
  if (!fs.existsSync(p)) return { header: [], rows: [] };
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

function main() {
  ensureDir(OUT_DIR);

  const issues: Issue[] = [];

  const reg = parseCsv(PATH_REGISTRY);
  const cluster = parseCsv(PATH_CLUSTER);
  const tpl = parseCsv(PATH_TEMPLATES);
  const micro = parseCsv(PATH_MICRO);

  const idx = (header: string[], name: string) => header.indexOf(name);

  const regSlugIdx = idx(reg.header, "CC_ID");
  const regEngineIdx = idx(reg.header, "ENGINE_TYPE");
  const clusterSlugIdx = idx(cluster.header, "CC_ID");
  const clusterRuleIdx = idx(cluster.header, "RULE_ID");
  const tplIdIdx = idx(tpl.header, "TEMPLATE_ID");
  const tplSlugIdx = idx(tpl.header, "CC_ID");
  const microSlugIdx = idx(micro.header, "Complaint_Slug");

  const knownComplaints = new Set<string>();
  const legacyComplaints = new Set<string>();
  for (const r of reg.rows) {
    const s = r[regSlugIdx] ?? "";
    if (s) knownComplaints.add(s);
    if (regEngineIdx >= 0 && (r[regEngineIdx] ?? "").toUpperCase() === "LEGACY") {
      legacyComplaints.add(s);
    }
  }

  const microComplaints = new Set<string>();
  if (microSlugIdx >= 0) {
    for (const r of micro.rows) {
      const s = r[microSlugIdx] ?? "";
      if (s) microComplaints.add(s);
    }
    for (const s of microComplaints) {
      if (!knownComplaints.has(s)) {
        issues.push({ kind: "micro_unknown_complaint", detail: `${s} is not in COMPLAINT_REGISTRY.csv` });
      }
    }
  }

  const seen = new Map<string, Set<string>>();
  for (const r of cluster.rows) {
    const slug = r[clusterSlugIdx] ?? "";
    const rid = r[clusterRuleIdx] ?? "";
    if (!slug || !rid) continue;
    if (!seen.has(slug)) seen.set(slug, new Set());
    const set = seen.get(slug)!;
    if (set.has(rid)) {
      issues.push({ kind: "duplicate_rule_id", detail: `${slug} has duplicate Rule_ID: ${rid}` });
    } else {
      set.add(rid);
    }
  }

  const tplPrefix = /^TPL_[A-Z0-9_]+$/;
  if (tplIdIdx >= 0) {
    for (const r of tpl.rows) {
      const slug = r[tplSlugIdx] ?? "";
      const tid = r[tplIdIdx] ?? "";
      if (!tid) continue;
      if (!tplPrefix.test(tid)) {
        issues.push({ kind: "bad_template_id", detail: `${slug} has Template_ID not matching TPL_[A-Z0-9_]+: ${tid}` });
      }
    }
  }

  const hasCluster = new Set<string>();
  for (const r of cluster.rows) {
    const slug = r[clusterSlugIdx] ?? "";
    if (slug) hasCluster.add(slug);
  }
  for (const s of knownComplaints) {
    if (!hasCluster.has(s) && !legacyComplaints.has(s)) {
      issues.push({ kind: "missing_cluster_rules", detail: `${s} has no CLUSTER_SCORING_RULES rows (ENGINE_TYPE is not LEGACY)` });
    }
  }

  const ok = issues.length === 0;

  const report = {
    ok,
    issues,
    counts: {
      knownComplaints: knownComplaints.size,
      microComplaints: microComplaints.size,
      clusterRuleComplaints: hasCluster.size,
      driftIssues: issues.length,
    },
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT_PATH}`);
  if (!ok) {
    console.log(`Drift audit FAIL: ${issues.length} issues`);
    for (const i of issues.slice(0, 25)) console.log(`- ${i.kind}: ${i.detail}`);
    process.exit(1);
  } else {
    console.log("Drift audit PASS");
    process.exit(0);
  }
}

main();
