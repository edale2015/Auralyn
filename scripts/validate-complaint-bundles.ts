import fs from "fs";
import path from "path";
import {
  loadComplaintConfig,
  validateComplaintBundle,
  type BundleIssue,
} from "../server/services/complaintConfigLoader";

const CSV_DIR = path.resolve("server/data/csv");

type Args = {
  engine?: string;
  cc?: string;
  quiet?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--engine") args.engine = argv[++i];
    else if (a === "--cc") args.cc = argv[++i];
    else if (a === "--quiet") args.quiet = true;
  }
  return args;
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

interface RegistryRow {
  CC_ID: string;
  SYSTEM: string;
  LABEL: string;
  ENGINE_TYPE: string;
  ENABLED: string;
}

function loadRegistryCsv(): RegistryRow[] {
  const filePath = path.join(CSV_DIR, "COMPLAINT_REGISTRY.csv");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry CSV not found: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8").trim();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj as unknown as RegistryRow;
  }).filter(r => r.CC_ID && r.ENABLED?.toUpperCase() !== "FALSE");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const registry = loadRegistryCsv()
    .filter(r => (args.cc ? r.CC_ID.toLowerCase() === args.cc.toLowerCase() : true))
    .filter(r => (args.engine ? (r.ENGINE_TYPE ?? "").toUpperCase() === args.engine.toUpperCase() : true));

  if (registry.length === 0) {
    console.error("No complaints matched the filter.");
    process.exit(2);
  }

  let passCount = 0;
  let warnCount = 0;
  const failures: Array<{
    ccId: string;
    label: string;
    engine: string;
    issues: BundleIssue[];
    error?: string;
  }> = [];

  for (const r of registry) {
    try {
      const cfg = await loadComplaintConfig(r.CC_ID);
      if (!cfg) {
        failures.push({
          ccId: r.CC_ID,
          label: r.LABEL,
          engine: r.ENGINE_TYPE,
          issues: [{ level: "ERROR", code: "CONFIG_NULL", message: "loadComplaintConfig returned null." }],
        });
        if (!args.quiet) console.log(`  FAIL  ${r.CC_ID} - CONFIG_NULL`);
        continue;
      }

      const issues = validateComplaintBundle(cfg);
      const errs = issues.filter(i => i.level === "ERROR");
      const warns = issues.filter(i => i.level === "WARN");

      if (errs.length > 0) {
        failures.push({ ccId: r.CC_ID, label: r.LABEL, engine: r.ENGINE_TYPE, issues });
        if (!args.quiet) console.log(`  FAIL  ${r.CC_ID} - ${errs.map(e => e.code).join(", ")}`);
      } else if (warns.length > 0) {
        warnCount++;
        if (!args.quiet) console.log(`  WARN  ${r.CC_ID} - ${warns.map(w => w.code).join(", ")}`);
      } else {
        passCount++;
        if (!args.quiet) console.log(`  PASS  ${r.CC_ID}`);
      }
    } catch (e: any) {
      failures.push({
        ccId: r.CC_ID,
        label: r.LABEL,
        engine: r.ENGINE_TYPE,
        issues: [{ level: "ERROR", code: "LOAD_FAILED", message: e.message }],
        error: e.stack,
      });
      if (!args.quiet) console.log(`  FAIL  ${r.CC_ID} - LOAD_FAILED: ${e.message}`);
    }
  }

  console.log(`\n=== Bundle ABI Summary ===`);
  console.log(`Checked: ${registry.length}  |  PASS: ${passCount}  |  WARN: ${warnCount}  |  FAIL: ${failures.length}`);

  if (failures.length > 0) {
    console.error(`\nFailing complaints:`);
    for (const f of failures) {
      console.error(`  ${f.ccId} (${f.engine}): ${f.issues.map(i => `${i.code}: ${i.message}`).join(" | ")}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch(e => {
  console.error("Fatal:", e.stack ?? e);
  process.exit(1);
});
