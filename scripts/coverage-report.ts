import fs from "fs";
import path from "path";

type Args = { outPath: string; ccs: string[] };

function parseArgs(argv: string[]): Args {
  const args: Args = { outPath: "data/complaints/reports/coverage_report.csv", ccs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.outPath = argv[++i];
    else if (a === "--cc") args.ccs.push(argv[++i]);
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
  if (!fs.existsSync(filePath)) throw new Error(`Missing: ${filePath}`);
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const packs = JSON.parse(fs.readFileSync(path.join(root, "data", "complaints", "profile_packs.json"), "utf8")) as Record<string, Profile>;
  const apply = readCsv(path.join(root, "data", "complaints", "profile_apply_seed.csv"));
  const csr = readCsv(path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv"));
  const dxp = readCsv(path.join(root, "server", "data", "csv", "DX_PRIORITY.csv"));

  const applyMap = new Map<string, string[]>();
  for (const r of apply.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const pf = (r.PROFILE_ID ?? "").trim();
    if (!cc || !pf) continue;
    if (!applyMap.has(cc)) applyMap.set(cc, []);
    applyMap.get(cc)!.push(pf);
  }

  const csrByCc = new Map<string, Record<string, string>[]>();
  for (const r of csr.rows) {
    const cc = (r.CC_ID ?? "").trim();
    if (!cc) continue;
    if (!csrByCc.has(cc)) csrByCc.set(cc, []);
    csrByCc.get(cc)!.push(r);
  }

  const dxpByCc = new Map<string, Record<string, string>[]>();
  for (const r of dxp.rows) {
    const cc = (r.CC_ID ?? "").trim();
    if (!cc) continue;
    if (!dxpByCc.has(cc)) dxpByCc.set(cc, []);
    dxpByCc.get(cc)!.push(r);
  }

  const allCcs = new Set([...applyMap.keys(), ...csrByCc.keys(), ...dxpByCc.keys()]);
  const ccFilter = args.ccs.length ? new Set(args.ccs) : null;

  const headers = [
    "CC_ID", "PROFILES", "CSR_TOTAL", "CSR_ACTIVE", "CSR_INERT",
    "CSR_PRIMARY", "CSR_SECONDARY", "CSR_BENIGN", "CSR_OTHER",
    "DXP_TOTAL", "PROFILE_TARGETS_TOTAL", "PROFILE_TARGETS_ACTIVE",
    "PROFILE_TARGETS_INERT", "PROFILE_TARGETS_MISSING_CSR",
  ];

  const outRows: Record<string, string>[] = [];
  let totals = { cc: 0, active: 0, inert: 0, missingTargets: 0 };

  for (const ccId of Array.from(allCcs).sort()) {
    if (ccFilter && !ccFilter.has(ccId)) continue;

    const profileIds = applyMap.get(ccId) ?? [];
    const csrRows = csrByCc.get(ccId) ?? [];
    const dxpRows = dxpByCc.get(ccId) ?? [];

    const inert = csrRows.filter((r) => {
      const when = (r.WHEN_EXPR ?? "").trim().toLowerCase();
      const pts = (r.POINTS ?? "").trim();
      return when === "false" || pts === "0" || pts === "";
    }).length;
    const active = csrRows.length - inert;

    const tierCounts = { PRIMARY: 0, SECONDARY: 0, BENIGN: 0, OTHER: 0 };
    for (const r of csrRows) {
      const cl = (r.CLUSTER_ID ?? "").toUpperCase();
      if (cl.endsWith("_PRIMARY")) tierCounts.PRIMARY++;
      else if (cl.endsWith("_SECONDARY")) tierCounts.SECONDARY++;
      else if (cl.endsWith("_BENIGN")) tierCounts.BENIGN++;
      else tierCounts.OTHER++;
    }

    let targetsTotal = 0, targetsActive = 0, targetsInert = 0, targetsMissing = 0;
    const missingList: string[] = [];

    for (const pfId of profileIds) {
      const p = packs[pfId];
      if (!p) continue;
      for (const item of p.activate) {
        targetsTotal++;
        const ruleId = dxToRuleId(ccId, item.dx);
        const row = csrRows.find((r) => r.RULE_ID === ruleId);
        if (!row) {
          targetsMissing++;
          missingList.push(`${pfId}:${item.dx}`);
        } else {
          const when = (row.WHEN_EXPR ?? "").trim().toLowerCase();
          const pts = (row.POINTS ?? "").trim();
          if (when === "false" || pts === "0" || pts === "") targetsInert++;
          else targetsActive++;
        }
      }
    }

    outRows.push({
      CC_ID: ccId,
      PROFILES: profileIds.join("|"),
      CSR_TOTAL: String(csrRows.length),
      CSR_ACTIVE: String(active),
      CSR_INERT: String(inert),
      CSR_PRIMARY: String(tierCounts.PRIMARY),
      CSR_SECONDARY: String(tierCounts.SECONDARY),
      CSR_BENIGN: String(tierCounts.BENIGN),
      CSR_OTHER: String(tierCounts.OTHER),
      DXP_TOTAL: String(dxpRows.length),
      PROFILE_TARGETS_TOTAL: String(targetsTotal),
      PROFILE_TARGETS_ACTIVE: String(targetsActive),
      PROFILE_TARGETS_INERT: String(targetsInert),
      PROFILE_TARGETS_MISSING_CSR: missingList.join("|") || "0",
    });

    totals.cc++;
    totals.active += active;
    totals.inert += inert;
    totals.missingTargets += targetsMissing;
  }

  const outAbs = path.isAbsolute(args.outPath) ? args.outPath : path.join(root, args.outPath);
  writeCsv(outAbs, headers, outRows);

  const usedProfiles = new Set(Array.from(applyMap.values()).flat());
  const unusedProfiles = Object.keys(packs).filter((p) => !usedProfiles.has(p));

  console.log("\n=== Coverage Report ===");
  console.log(`Complaints with profiles: ${applyMap.size}`);
  console.log(`Total complaints with CSR: ${csrByCc.size}`);
  console.log(`CSR active: ${totals.active} | inert: ${totals.inert}`);
  console.log(`Profile targets missing CSR rows: ${totals.missingTargets}`);
  if (unusedProfiles.length) console.log(`Unused profiles: ${unusedProfiles.join(", ")}`);
  console.log(`\nWrote: ${outAbs}`);
}

main();
