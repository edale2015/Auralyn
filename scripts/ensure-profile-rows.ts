import fs from "fs";
import path from "path";

type Args = { ccId: string; profileId: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const ccId = argv[0];
  const profileId = argv[1];
  if (!ccId || !profileId) {
    console.error("Usage: npx tsx scripts/ensure-profile-rows.ts <cc_id> <PROFILE_ID> [--dry-run]");
    process.exit(2);
  }
  return { ccId, profileId, dryRun: argv.includes("--dry-run") };
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

function dxToRuleId(ccId: string, dx: string): string {
  return `CSR_${ccId.toUpperCase()}_DX_${dx.toUpperCase()}`;
}

function dxToClusterId(prefix: string, dx: string): string {
  return `CL_${prefix}_${dx.toUpperCase()}`;
}

function main() {
  const { ccId, profileId, dryRun } = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const PROFILE_PATH = path.join(root, "data", "complaints", "profile_packs.json");
  const CSR_PATH = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");

  if (!fs.existsSync(PROFILE_PATH)) throw new Error(`Missing: ${PROFILE_PATH}`);
  if (!fs.existsSync(CSR_PATH)) throw new Error(`Missing: ${CSR_PATH}`);

  const profiles = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as Record<string, Profile>;
  const profile = profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  if (profile.cc_id !== ccId) {
    console.warn(`Warning: profile cc_id="${profile.cc_id}" does not match argument cc_id="${ccId}"`);
  }

  const csr = readCsv(CSR_PATH);
  const existingRuleIds = new Set(csr.rows.filter((r) => r.CC_ID === ccId).map((r) => r.RULE_ID));

  let added = 0;
  const changes: string[] = [];

  for (const item of profile.activate) {
    const ruleId = dxToRuleId(ccId, item.dx);
    if (existingRuleIds.has(ruleId)) continue;

    const clusterId = dxToClusterId(profile.cluster_prefix, item.dx);

    csr.rows.push({
      CC_ID: ccId,
      CLUSTER_ID: clusterId,
      RULE_ID: ruleId,
      POINTS: "0",
      WHEN_EXPR: "false",
      EVIDENCE_LABEL: `${item.dx.replace(/_/g, " ")} pattern (STUB - edit WHEN_EXPR)`,
    });

    existingRuleIds.add(ruleId);
    added++;
    changes.push(`ADD: ${ruleId} -> ${clusterId}`);
  }

  if (added > 0 && !dryRun) {
    writeCsv(CSR_PATH, csr.headers, csr.rows);
  }

  console.log("\n=== Ensure Profile Rows ===");
  console.log(`CC_ID: ${ccId}`);
  console.log(`PROFILE: ${profileId}`);
  console.log(`CSR rows added: ${added}`);
  if (changes.length) {
    if (dryRun) console.log("(dry run — no files written)");
    console.log("\nChanges:");
    for (const c of changes) console.log(`  ${c}`);
  } else {
    console.log("\nNo changes (all targets already exist).");
  }
}

main();
