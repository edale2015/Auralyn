import fs from "fs";
import path from "path";

type Args = { ccId: string; profileId: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const ccId = argv[0];
  const profileId = argv[1];
  if (!ccId || !profileId) {
    console.error("Usage: npx tsx scripts/apply-profile-pack.ts <cc_id> <PROFILE_ID> [--dry-run]");
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

function main() {
  const { ccId, profileId, dryRun } = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const PROFILE_PATH = path.join(root, "data", "complaints", "profile_packs.json");
  const CSR_PATH = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");
  const DXP_PATH = path.join(root, "server", "data", "csv", "DX_PRIORITY.csv");

  if (!fs.existsSync(PROFILE_PATH)) throw new Error(`Missing: ${PROFILE_PATH}`);
  if (!fs.existsSync(CSR_PATH)) throw new Error(`Missing: ${CSR_PATH}`);
  if (!fs.existsSync(DXP_PATH)) throw new Error(`Missing: ${DXP_PATH}`);

  const profiles = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as Record<string, Profile>;
  const profile = profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  if (profile.cc_id !== ccId) {
    console.warn(`Warning: profile cc_id="${profile.cc_id}" does not match argument cc_id="${ccId}"`);
  }

  const csr = readCsv(CSR_PATH);
  const dxp = readCsv(DXP_PATH);

  let csrUpdated = 0;
  let csrMissing = 0;
  let dxpUpdated = 0;
  const changes: string[] = [];

  for (const item of profile.activate) {
    const ruleId = dxToRuleId(ccId, item.dx);
    const target = csr.rows.find((r) => r.CC_ID === ccId && r.RULE_ID === ruleId);

    if (!target) {
      csrMissing++;
      changes.push(`MISSING: ${ruleId} — run ensure-profile-rows first`);
      continue;
    }

    let touched = false;
    const before = { WHEN_EXPR: target.WHEN_EXPR, POINTS: target.POINTS, EVIDENCE_LABEL: target.EVIDENCE_LABEL };

    if (target.WHEN_EXPR !== item.when) { target.WHEN_EXPR = item.when; touched = true; }
    if (target.POINTS !== String(item.points)) { target.POINTS = String(item.points); touched = true; }
    if (target.EVIDENCE_LABEL !== item.label) { target.EVIDENCE_LABEL = item.label; touched = true; }

    if (touched) {
      csrUpdated++;
      changes.push(
        `UPDATE: ${ruleId}\n` +
        `    WHEN_EXPR: ${before.WHEN_EXPR} -> ${item.when}\n` +
        `    POINTS: ${before.POINTS} -> ${item.points}\n` +
        `    LABEL: ${before.EVIDENCE_LABEL} -> ${item.label}`
      );
    }
  }

  const dxpExisting = new Set(
    dxp.rows.filter((r) => r.CC_ID === ccId).map((r) => r.CLUSTER_ID)
  );

  for (const item of profile.activate) {
    const clusterId = `CL_${profile.cluster_prefix}_${item.dx.toUpperCase()}`;
    if (dxpExisting.has(clusterId)) {
      const row = dxp.rows.find((r) => r.CC_ID === ccId && r.CLUSTER_ID === clusterId);
      if (row && row.PRIORITY !== String(item.points * 10)) {
        const before = row.PRIORITY;
        row.PRIORITY = String(item.points * 10);
        dxpUpdated++;
        changes.push(`DXP UPDATE: ${clusterId} PRIORITY ${before} -> ${item.points * 10}`);
      }
      continue;
    }

    dxp.rows.push({
      CC_ID: ccId,
      CLUSTER_ID: clusterId,
      PRIORITY: String(item.points * 10),
    });
    dxpExisting.add(clusterId);
    dxpUpdated++;
    changes.push(`DXP ADD: ${clusterId} PRIORITY=${item.points * 10}`);
  }

  if (csrMissing > 0) {
    console.log("\n=== Profile Pack ABORTED ===");
    console.log(`CC_ID: ${ccId}`);
    console.log(`PROFILE: ${profileId}`);
    console.log(`CSR missing: ${csrMissing} — no files written to prevent partial activation`);
    console.log("\nMissing targets:");
    for (const c of changes.filter((x) => x.startsWith("MISSING"))) console.log(`  ${c}`);
    console.log(`\nTip: run 'npx tsx scripts/ensure-profile-rows.ts ${ccId} ${profileId}' first.`);
    process.exit(1);
  }

  if (!dryRun) {
    writeCsv(CSR_PATH, csr.headers, csr.rows);
    writeCsv(DXP_PATH, dxp.headers, dxp.rows);
  }

  console.log("\n=== Profile Pack Applied ===");
  console.log(`CC_ID: ${ccId}`);
  console.log(`PROFILE: ${profileId}`);
  console.log(`CSR updated: ${csrUpdated}`);
  console.log(`DXP changes: ${dxpUpdated}`);
  if (dryRun) console.log("(dry run — no files written)");
  if (changes.length) {
    console.log("\nChanges:");
    for (const c of changes) console.log(`  ${c}`);
  } else {
    console.log("\nNo changes (already applied).");
  }
}

main();
