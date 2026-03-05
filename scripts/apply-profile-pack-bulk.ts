import fs from "fs";
import path from "path";

type Args = {
  seedPath: string;
  dryRun: boolean;
  continueOnFail: boolean;
  onlyProfile?: string;
  ccs: string[];
  listOnly: boolean;
  summaryJsonPath?: string;
};

function parseArgs(argv: string[]): Args {
  const seedPath = argv[0];
  if (!seedPath) {
    console.error("Usage: npx tsx scripts/apply-profile-pack-bulk.ts <seed.csv> [flags]");
    console.error("Flags: --dry-run --continue-on-fail --only-profile <ID> --cc <id> --list --summary-json <path>");
    process.exit(2);
  }
  const args: Args = { seedPath, dryRun: false, continueOnFail: false, ccs: [], listOnly: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--continue-on-fail") args.continueOnFail = true;
    else if (a === "--only-profile") args.onlyProfile = argv[++i];
    else if (a === "--cc") args.ccs.push(argv[++i]);
    else if (a === "--list") args.listOnly = true;
    else if (a === "--summary-json") args.summaryJsonPath = argv[++i];
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
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => c === "")) continue;
    const r: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? "";
    rows.push(r);
  }
  return { headers, rows };
}

function csvSafe(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvSafe(r[h] ?? "")).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

type Profile = {
  cc_id: string;
  cluster_prefix: string;
  activate: Array<{ dx: string; when: string; points: number; label: string }>;
};

type ItemResult = {
  ccId: string;
  profileId: string;
  ok: boolean;
  csrEnsured: number;
  csrUpdated: number;
  dxpChanges: number;
  errors: string[];
  notes: string[];
};

function dxToRuleId(ccId: string, dx: string): string {
  return `CSR_${ccId.toUpperCase()}_DX_${dx.toUpperCase()}`;
}

function readSeed(filePath: string): Array<{ CC_ID: string; PROFILE_ID: string }> {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const idxCc = headers.indexOf("CC_ID");
  const idxPf = headers.indexOf("PROFILE_ID");
  if (idxCc < 0 || idxPf < 0) throw new Error(`Seed CSV must have headers CC_ID,PROFILE_ID`);
  const rows: Array<{ CC_ID: string; PROFILE_ID: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const cc = (cols[idxCc] ?? "").trim();
    const pf = (cols[idxPf] ?? "").trim();
    if (cc && pf) rows.push({ CC_ID: cc, PROFILE_ID: pf });
  }
  return rows;
}

function applyFilters(rows: Array<{ CC_ID: string; PROFILE_ID: string }>, args: Args) {
  let out = rows;
  if (args.onlyProfile) out = out.filter((r) => r.PROFILE_ID === args.onlyProfile);
  if (args.ccs.length) {
    const set = new Set(args.ccs);
    out = out.filter((r) => set.has(r.CC_ID));
  }
  return out;
}

function processItem(
  ccId: string,
  profileId: string,
  profile: Profile,
  csrRows: Record<string, string>[],
  dxpRows: Record<string, string>[]
): ItemResult {
  const result: ItemResult = {
    ccId, profileId, ok: true,
    csrEnsured: 0, csrUpdated: 0, dxpChanges: 0,
    errors: [], notes: [],
  };

  if (profile.cc_id !== ccId) {
    result.notes.push(`cc_id mismatch: profile="${profile.cc_id}" arg="${ccId}"`);
  }

  const existingRuleIds = new Set(csrRows.filter((r) => r.CC_ID === ccId).map((r) => r.RULE_ID));
  const dxpExisting = new Set(dxpRows.filter((r) => r.CC_ID === ccId).map((r) => r.CLUSTER_ID));

  for (const item of profile.activate) {
    const ruleId = dxToRuleId(ccId, item.dx);
    const clusterId = `CL_${profile.cluster_prefix}_${item.dx.toUpperCase()}`;

    if (!existingRuleIds.has(ruleId)) {
      csrRows.push({
        CC_ID: ccId,
        CLUSTER_ID: clusterId,
        RULE_ID: ruleId,
        POINTS: "0",
        WHEN_EXPR: "false",
        EVIDENCE_LABEL: `${item.dx.replace(/_/g, " ")} pattern (STUB - edit WHEN_EXPR)`,
      });
      existingRuleIds.add(ruleId);
      result.csrEnsured++;
      result.notes.push(`ENSURE: ${ruleId}`);
    }

    const target = csrRows.find((r) => r.CC_ID === ccId && r.RULE_ID === ruleId);
    if (!target) {
      result.errors.push(`BUG: could not find ${ruleId} after ensure`);
      result.ok = false;
      continue;
    }

    let touched = false;
    if (target.WHEN_EXPR !== item.when) { target.WHEN_EXPR = item.when; touched = true; }
    if (target.POINTS !== String(item.points)) { target.POINTS = String(item.points); touched = true; }
    if (target.EVIDENCE_LABEL !== item.label) { target.EVIDENCE_LABEL = item.label; touched = true; }

    if (touched) {
      result.csrUpdated++;
      result.notes.push(`ACTIVATE: ${ruleId} POINTS=${item.points}`);
    }

    if (!dxpExisting.has(clusterId)) {
      dxpRows.push({ CC_ID: ccId, CLUSTER_ID: clusterId, PRIORITY: String(item.points * 10) });
      dxpExisting.add(clusterId);
      result.dxpChanges++;
      result.notes.push(`DXP ADD: ${clusterId} PRIORITY=${item.points * 10}`);
    } else {
      const existing = dxpRows.find((r) => r.CC_ID === ccId && r.CLUSTER_ID === clusterId);
      if (existing && existing.PRIORITY !== String(item.points * 10)) {
        const before = existing.PRIORITY;
        existing.PRIORITY = String(item.points * 10);
        result.dxpChanges++;
        result.notes.push(`DXP UPDATE: ${clusterId} PRIORITY ${before} -> ${item.points * 10}`);
      }
    }
  }

  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const seedAbs = path.isAbsolute(args.seedPath) ? args.seedPath : path.join(root, args.seedPath);
  if (!fs.existsSync(seedAbs)) throw new Error(`Seed not found: ${seedAbs}`);

  const PROFILE_PATH = path.join(root, "data", "complaints", "profile_packs.json");
  const CSR_PATH = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");
  const DXP_PATH = path.join(root, "server", "data", "csv", "DX_PRIORITY.csv");

  if (!fs.existsSync(PROFILE_PATH)) throw new Error(`Missing: ${PROFILE_PATH}`);
  if (!fs.existsSync(CSR_PATH)) throw new Error(`Missing: ${CSR_PATH}`);
  if (!fs.existsSync(DXP_PATH)) throw new Error(`Missing: ${DXP_PATH}`);

  const rowsAll = readSeed(seedAbs);
  const rows = applyFilters(rowsAll, args);

  if (args.listOnly) {
    console.log("\n=== Bulk Profile Apply Plan ===");
    console.log(`Seed rows: ${rowsAll.length} | After filters: ${rows.length}\n`);
    for (const r of rows) console.log(`  ${r.CC_ID} -> ${r.PROFILE_ID}`);
    process.exit(0);
  }

  const profiles = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as Record<string, Profile>;
  const csr = readCsv(CSR_PATH);
  const dxp = readCsv(DXP_PATH);

  console.log(`\n=== Bulk Profile Apply (${rows.length} complaints) ===`);
  if (args.dryRun) console.log("Mode: DRY RUN");

  const results: ItemResult[] = [];

  for (const r of rows) {
    const profile = profiles[r.PROFILE_ID];
    if (!profile) {
      results.push({
        ccId: r.CC_ID, profileId: r.PROFILE_ID, ok: false,
        csrEnsured: 0, csrUpdated: 0, dxpChanges: 0,
        errors: [`Profile not found: ${r.PROFILE_ID}`], notes: [],
      });
      if (!args.continueOnFail) break;
      continue;
    }

    const item = processItem(r.CC_ID, r.PROFILE_ID, profile, csr.rows, dxp.rows);
    results.push(item);

    const status = item.ok ? "OK" : "FAIL";
    console.log(`\n  ${status} ${r.CC_ID} -> ${r.PROFILE_ID}: ensured=${item.csrEnsured} activated=${item.csrUpdated} dxp=${item.dxpChanges}`);
    for (const n of item.notes) console.log(`    ${n}`);
    for (const e of item.errors) console.log(`    ERROR: ${e}`);

    if (!item.ok && !args.continueOnFail) break;
  }

  if (!args.dryRun) {
    writeCsv(CSR_PATH, csr.headers, csr.rows);
    writeCsv(DXP_PATH, dxp.headers, dxp.rows);
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const totalEnsured = results.reduce((s, r) => s + r.csrEnsured, 0);
  const totalActivated = results.reduce((s, r) => s + r.csrUpdated, 0);
  const totalDxp = results.reduce((s, r) => s + r.dxpChanges, 0);

  console.log("\n=== Summary ===");
  console.log(`Complaints: ${results.length} (OK: ${okCount}, FAIL: ${failCount})`);
  console.log(`CSR ensured: ${totalEnsured} | CSR activated: ${totalActivated} | DXP changes: ${totalDxp}`);
  if (args.dryRun) console.log("(dry run — no files written)");

  if (args.summaryJsonPath) {
    const summaryData = {
      seedPath: args.seedPath,
      dryRun: args.dryRun,
      attempted: results.length,
      ok: okCount,
      fail: failCount,
      results,
      generated_at: new Date().toISOString(),
    };
    if (!args.dryRun) {
      fs.mkdirSync(path.dirname(args.summaryJsonPath), { recursive: true });
      fs.writeFileSync(args.summaryJsonPath, JSON.stringify(summaryData, null, 2) + "\n", "utf8");
      console.log(`\nWrote summary: ${args.summaryJsonPath}`);
    }
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main();
