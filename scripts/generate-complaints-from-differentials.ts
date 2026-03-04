import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const CSV_DIR = path.resolve("server/data/csv");
const TEST_DIR = path.resolve("tests/cases");

interface SeedRow {
  COMPLAINT_KEY: string;
  SYSTEM: string;
  LABEL: string;
  ALIASES: string;
  DIFFERENTIALS: string;
}

interface Args {
  seedPath: string;
  dryRun: boolean;
  noGolden: boolean;
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
  return out.map(s => s.trim());
}

function parseCsv(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, "utf8").trim();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
}

function appendCsvRows(filename: string, rows: string[]): void {
  const filePath = path.join(CSV_DIR, filename);
  const existing = fs.readFileSync(filePath, "utf-8");
  const needsNewline = !existing.endsWith("\n");
  const content = (needsNewline ? "\n" : "") + rows.join("\n") + "\n";
  fs.appendFileSync(filePath, content);
}

function getExistingRuleIds(filename: string, keyCol: string): Set<string> {
  const filePath = path.join(CSV_DIR, filename);
  if (!fs.existsSync(filePath)) return new Set();
  const rows = parseCsv(filePath);
  return new Set(rows.map(r => r[keyCol]).filter(Boolean));
}

function getExistingCcIds(): Set<string> {
  const rows = parseCsv(path.join(CSV_DIR, "COMPLAINT_REGISTRY.csv"));
  return new Set(rows.map(r => r.CC_ID).filter(Boolean));
}

function splitSemi(s: string): string[] {
  return (s ?? "").split(";").map(x => x.trim()).filter(Boolean);
}

function prefix(ccId: string): string {
  return ccId.split("_").map(w => w[0]?.toUpperCase() || "").join("");
}

function parseArgs(argv: string[]): Args {
  const seedPath = argv[0];
  if (!seedPath) {
    console.error("Usage: npx tsx scripts/generate-complaints-from-differentials.ts <seed.csv> [--dry-run] [--no-golden]");
    process.exit(2);
  }
  const args: Args = { seedPath, dryRun: false, noGolden: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--no-golden") args.noGolden = true;
  }
  return args;
}

function runBaseGenerator(ccId: string, system: string, label: string, aliases: string, dryRun: boolean): void {
  const existingIds = getExistingCcIds();
  if (existingIds.has(ccId)) {
    console.log(`  [gen] SKIP ${ccId} (already in registry)`);
    return;
  }

  if (dryRun) {
    console.log(`  [gen] DRY: would run generate-complaints.ts ${ccId} ${system} "${label}" "${aliases}"`);
    return;
  }

  const res = spawnSync("npx", ["tsx", "scripts/generate-complaints.ts", ccId, system, label, aliases], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`generate-complaints.ts failed for ${ccId} (exit ${res.status})`);
  }
}

function csvSafe(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildDifferentialCsrRows(ccId: string, pfx: string, differentials: string[]): string[] {
  const existingRuleIds = getExistingRuleIds("CLUSTER_SCORING_RULES.csv", "RULE_ID");
  const rows: string[] = [];

  for (let i = 0; i < differentials.length; i++) {
    const dx = differentials[i];
    const dxUpper = dx.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const ruleId = `CSR_${ccId.toUpperCase()}_DX_${dxUpper}`;

    if (existingRuleIds.has(ruleId)) continue;

    const clusterId = `CL_${pfx}_${dxUpper}`;
    const evidenceLabel = csvSafe(`${dx.replace(/_/g, " ")} pattern (STUB - edit WHEN_EXPR)`);

    rows.push(`${ccId},${clusterId},${ruleId},0,false,${evidenceLabel}`);
  }

  return rows;
}

function buildDifferentialDxPriorityRows(ccId: string, pfx: string, differentials: string[]): string[] {
  const existingPairs = new Set<string>();
  const dxpPath = path.join(CSV_DIR, "DX_PRIORITY.csv");
  if (fs.existsSync(dxpPath)) {
    const rows = parseCsv(dxpPath);
    for (const r of rows) {
      if (r.CC_ID && r.CLUSTER_ID) existingPairs.add(`${r.CC_ID}|${r.CLUSTER_ID}`);
    }
  }

  const rows: string[] = [];
  for (let i = 0; i < differentials.length; i++) {
    const dx = differentials[i];
    const dxUpper = dx.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const clusterId = `CL_${pfx}_${dxUpper}`;
    const pairKey = `${ccId}|${clusterId}`;

    if (existingPairs.has(pairKey)) continue;

    const priority = (differentials.length - i) * 10;
    rows.push(`${ccId},${clusterId},${priority}`);
  }

  return rows;
}

function emitGoldenSuggestions(ccId: string, pfx: string, label: string, differentials: string[]): void {
  const dir = path.resolve("scripts/golden_suggestions");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const suggestions: any[] = [];
  for (let i = 0; i < differentials.length; i++) {
    const dx = differentials[i];
    const dxUpper = dx.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const clusterId = `CL_${pfx}_${dxUpper}`;

    suggestions.push({
      id: `GD_${(i + 1).toString().padStart(2, "0")}`,
      label: `${label} - ${dx.replace(/_/g, " ")} pattern`,
      cc_id: ccId,
      note: `TODO: fill answers that would make ${clusterId} the top-scoring cluster`,
      expect: {
        cluster: clusterId,
        disposition: i < 2 ? "pcp" : "self_care",
        rf_gate: "PASS",
        rf_must_fire: [],
      },
    });
  }

  const outPath = path.join(dir, `${ccId}_differentials.json`);
  fs.writeFileSync(outPath, JSON.stringify(suggestions, null, 2) + "\n");
  console.log(`  [golden] Wrote ${suggestions.length} suggestions to ${outPath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seedAbs = path.isAbsolute(args.seedPath) ? args.seedPath : path.resolve(args.seedPath);

  if (!fs.existsSync(seedAbs)) {
    console.error(`Seed file not found: ${seedAbs}`);
    process.exit(1);
  }

  const seed = parseCsv(seedAbs) as unknown as SeedRow[];

  console.log(`\nDifferentials seed: ${seed.length} complaints from ${path.basename(seedAbs)}\n`);

  let totalComplaints = 0;
  let totalCsrAdded = 0;
  let totalDxpAdded = 0;

  for (const row of seed) {
    const ccId = (row.COMPLAINT_KEY || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const system = (row.SYSTEM || "GENERAL").trim().toUpperCase();
    const label = (row.LABEL || ccId).trim();
    const aliases = (row.ALIASES || ccId).trim();
    const differentials = splitSemi(row.DIFFERENTIALS);

    if (!ccId) continue;
    totalComplaints++;

    console.log(`\n--- ${ccId} (${system}) ---`);
    console.log(`  Differentials: ${differentials.join(", ") || "(none)"}`);

    runBaseGenerator(ccId, system, label, aliases, args.dryRun);

    const pfx = prefix(ccId);

    if (differentials.length > 0) {
      const csrRows = buildDifferentialCsrRows(ccId, pfx, differentials);
      if (csrRows.length > 0) {
        if (args.dryRun) {
          console.log(`  [csr] DRY: would add ${csrRows.length} cluster scoring rules`);
        } else {
          appendCsvRows("CLUSTER_SCORING_RULES.csv", csrRows);
          console.log(`  [csr] Added ${csrRows.length} differential cluster scoring rules`);
        }
        totalCsrAdded += csrRows.length;
      } else {
        console.log(`  [csr] All differential rules already exist`);
      }

      const dxpRows = buildDifferentialDxPriorityRows(ccId, pfx, differentials);
      if (dxpRows.length > 0) {
        if (args.dryRun) {
          console.log(`  [dxp] DRY: would add ${dxpRows.length} DX priority rows`);
        } else {
          appendCsvRows("DX_PRIORITY.csv", dxpRows);
          console.log(`  [dxp] Added ${dxpRows.length} DX priority rows`);
        }
        totalDxpAdded += dxpRows.length;
      } else {
        console.log(`  [dxp] All DX priority rows already exist`);
      }

      if (!args.noGolden) {
        emitGoldenSuggestions(ccId, pfx, label, differentials);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Complaints processed: ${totalComplaints}`);
  console.log(`CSR rows added: ${totalCsrAdded}`);
  console.log(`DX priority rows added: ${totalDxpAdded}`);
  if (args.dryRun) console.log(`(dry run — nothing was written)`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit WHEN_EXPR in CLUSTER_SCORING_RULES.csv for each differential (currently 'true')`);
  console.log(`  2. Flesh out golden tests from scripts/golden_suggestions/<cc_id>_differentials.json`);
  console.log(`  3. Run: npx tsx scripts/run_harness.ts --all`);
}

main();
