import fs from "node:fs";
import path from "node:path";

const CSV_DIR = path.join("server", "data", "csv");

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
  return out.map(s => s.trim());
}

function loadCsv(filename: string): { header: string[]; rows: Record<string, string>[] } {
  const p = path.join(CSV_DIR, filename);
  if (!fs.existsSync(p)) return { header: [], rows: [] };
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(l => l.trim());
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { header, rows };
}

const CC_ID_PATTERN = /^[a-z0-9_]+$/;
let errors = 0;

function check(table: string, test: boolean, msg: string) {
  if (!test) {
    console.error(`FAIL [${table}] ${msg}`);
    errors++;
  }
}

function main() {
  console.log("Running corruption guard checks...\n");

  const registry = loadCsv("COMPLAINT_REGISTRY.csv");
  check("COMPLAINT_REGISTRY", registry.rows.length > 0, "No rows found");
  const knownCcIds = new Set<string>();
  for (const r of registry.rows) {
    const ccId = r.CC_ID ?? "";
    check("COMPLAINT_REGISTRY", CC_ID_PATTERN.test(ccId), `Invalid CC_ID format: "${ccId}"`);
    check("COMPLAINT_REGISTRY", !knownCcIds.has(ccId), `Duplicate CC_ID: ${ccId}`);
    knownCcIds.add(ccId);
    check("COMPLAINT_REGISTRY", !!r.SYSTEM, `Missing SYSTEM for ${ccId}`);
    check("COMPLAINT_REGISTRY", !!r.ENGINE_TYPE, `Missing ENGINE_TYPE for ${ccId}`);
  }

  const coreQ = loadCsv("CORE_QUESTIONS.csv");
  check("CORE_QUESTIONS", coreQ.rows.length > 0, "No rows found");
  for (const r of coreQ.rows) {
    check("CORE_QUESTIONS", CC_ID_PATTERN.test(r.CC_ID ?? ""), `Invalid CC_ID: "${r.CC_ID}"`);
    check("CORE_QUESTIONS", !!r.Q_ID, `Missing Q_ID for ${r.CC_ID}`);
  }

  const rfRules = loadCsv("RED_FLAG_RULES.csv");
  check("RED_FLAG_RULES", rfRules.rows.length > 0, "No rows found");
  for (const r of rfRules.rows) {
    check("RED_FLAG_RULES", CC_ID_PATTERN.test(r.CC_ID ?? ""), `Invalid CC_ID: "${r.CC_ID}"`);
    check("RED_FLAG_RULES", !!r.RF_ID, `Missing RF_ID for ${r.CC_ID}`);
  }

  const dispRules = loadCsv("DISPOSITION_RULES.csv");
  check("DISPOSITION_RULES", dispRules.rows.length > 0, "No rows found");
  for (const r of dispRules.rows) {
    check("DISPOSITION_RULES", CC_ID_PATTERN.test(r.CC_ID ?? ""), `Invalid CC_ID: "${r.CC_ID}"`);
  }

  const cluster = loadCsv("CLUSTER_SCORING_RULES.csv");
  check("CLUSTER_SCORING_RULES", cluster.rows.length > 0, "No rows found");
  for (const r of cluster.rows) {
    check("CLUSTER_SCORING_RULES", CC_ID_PATTERN.test(r.CC_ID ?? ""), `Invalid CC_ID: "${r.CC_ID}"`);
    check("CLUSTER_SCORING_RULES", !!r.CLUSTER_ID, `Missing CLUSTER_ID for rule ${r.RULE_ID}`);
    check("CLUSTER_SCORING_RULES", !!r.RULE_ID, `Missing RULE_ID for ${r.CC_ID}`);
    const pts = Number(r.POINTS);
    check("CLUSTER_SCORING_RULES", !isNaN(pts), `Invalid POINTS "${r.POINTS}" for rule ${r.RULE_ID}`);
    check("CLUSTER_SCORING_RULES", !!r.WHEN_EXPR, `Missing WHEN_EXPR for rule ${r.RULE_ID}`);
  }

  const templates = loadCsv("OUTPUT_TEMPLATES.csv");
  check("OUTPUT_TEMPLATES", templates.rows.length > 0, "No rows found");

  const dxPriority = loadCsv("DX_PRIORITY.csv");
  if (dxPriority.rows.length > 0) {
    for (const r of dxPriority.rows) {
      check("DX_PRIORITY", CC_ID_PATTERN.test(r.CC_ID ?? ""), `Invalid CC_ID: "${r.CC_ID}"`);
      check("DX_PRIORITY", !!r.CLUSTER_ID, `Missing CLUSTER_ID for ${r.CC_ID}`);
      const pri = Number(r.PRIORITY);
      check("DX_PRIORITY", !isNaN(pri) && pri > 0, `Invalid PRIORITY "${r.PRIORITY}" for ${r.CC_ID}/${r.CLUSTER_ID}`);
    }
  }

  const scoringSystems = loadCsv("SCORING_SYSTEMS.csv");
  if (scoringSystems.rows.length > 0) {
    const seenCriteria = new Set<string>();
    for (const r of scoringSystems.rows) {
      check("SCORING_SYSTEMS", !!r.Score_ID, `Missing Score_ID`);
      check("SCORING_SYSTEMS", !!r.Criterion_ID, `Missing Criterion_ID for ${r.Score_ID}`);
      check("SCORING_SYSTEMS", !!r.Logic, `Missing Logic for ${r.Score_ID}/${r.Criterion_ID}`);
      const pts = Number(r.Points);
      check("SCORING_SYSTEMS", !isNaN(pts), `Invalid Points "${r.Points}" for ${r.Score_ID}/${r.Criterion_ID}`);
      const applies = r.Applies_To_Complaint ?? "";
      check("SCORING_SYSTEMS", applies === "*" || CC_ID_PATTERN.test(applies), `Invalid Applies_To_Complaint: "${applies}" for ${r.Score_ID}`);
      const dupeKey = `${r.Score_ID}::${r.Criterion_ID}`;
      check("SCORING_SYSTEMS", !seenCriteria.has(dupeKey), `Duplicate criterion: ${dupeKey}`);
      seenCriteria.add(dupeKey);
      if (r.Threshold_JSON && r.Threshold_JSON.trim()) {
        try { JSON.parse(r.Threshold_JSON); } catch { check("SCORING_SYSTEMS", false, `Invalid Threshold_JSON for ${r.Score_ID}/${r.Criterion_ID}`); }
      }
    }
  }

  const consistencyRules = loadCsv("CONSISTENCY_RULES.csv");
  if (consistencyRules.rows.length > 0) {
    const seenRuleIds = new Set<string>();
    const validActions = new Set(["FLAG_ONLY", "NEEDS_REVIEW", "FORCE_EMERG"]);
    const validSeverities = new Set(["LOW", "MODERATE", "HIGH"]);
    for (const r of consistencyRules.rows) {
      check("CONSISTENCY_RULES", !!r.Rule_ID, `Missing Rule_ID`);
      check("CONSISTENCY_RULES", !seenRuleIds.has(r.Rule_ID ?? ""), `Duplicate Rule_ID: ${r.Rule_ID}`);
      seenRuleIds.add(r.Rule_ID ?? "");
      const applies = r.Applies_To ?? "";
      check("CONSISTENCY_RULES", applies === "*" || CC_ID_PATTERN.test(applies), `Invalid Applies_To format: "${applies}" for ${r.Rule_ID}`);
      if (applies !== "*" && applies) {
        check("CONSISTENCY_RULES", knownCcIds.has(applies), `Applies_To "${applies}" not found in COMPLAINT_REGISTRY for ${r.Rule_ID}`);
      }
      check("CONSISTENCY_RULES", !!r.Logic, `Missing Logic for ${r.Rule_ID}`);
      check("CONSISTENCY_RULES", validActions.has(r.Action ?? ""), `Invalid Action "${r.Action}" for ${r.Rule_ID}`);
      check("CONSISTENCY_RULES", validSeverities.has(r.Severity ?? ""), `Invalid Severity "${r.Severity}" for ${r.Rule_ID}`);
      check("CONSISTENCY_RULES", !!r.Message, `Missing Message for ${r.Rule_ID}`);
    }
  }

  console.log(`\nTables checked: COMPLAINT_REGISTRY (${registry.rows.length}), CORE_QUESTIONS (${coreQ.rows.length}), RED_FLAG_RULES (${rfRules.rows.length}), DISPOSITION_RULES (${dispRules.rows.length}), CLUSTER_SCORING_RULES (${cluster.rows.length}), OUTPUT_TEMPLATES (${templates.rows.length}), DX_PRIORITY (${dxPriority.rows.length}), SCORING_SYSTEMS (${scoringSystems.rows.length}), CONSISTENCY_RULES (${consistencyRules.rows.length})`);

  if (errors > 0) {
    console.error(`\nCorruption guard FAIL: ${errors} errors`);
    process.exit(1);
  } else {
    console.log("\nCorruption guard PASS");
    process.exit(0);
  }
}

main();
