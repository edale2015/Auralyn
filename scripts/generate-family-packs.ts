import fs from "fs";
import path from "path";

type Args = {
  seedPath: string;
  dryRun: boolean;
  emitQuestionsPath?: string;
};

function parseArgs(argv: string[]): Args {
  const seedPath = argv[0];
  if (!seedPath) {
    console.error(
      "Usage: npx tsx scripts/generate-family-packs.ts <family_seed.csv> [--dry-run] [--emit-questions <out.csv>]"
    );
    process.exit(2);
  }
  const args: Args = { seedPath, dryRun: argv.includes("--dry-run") };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--emit-questions") args.emitQuestionsPath = argv[++i];
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
  if (!fs.existsSync(filePath)) return { headers: [] as string[], rows: [] as Record<string, string>[] };
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

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[], dryRun: boolean) {
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvSafe(r[h] ?? "")).join(","));
  }
  const content = lines.join("\n") + "\n";
  if (dryRun) {
    console.log(`[DRY] Would write ${rows.length} rows -> ${filePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function splitSemi(s: string): string[] {
  return (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
}

function parseQuestionsPacked(s: string): Array<{ token: string; type: string }> {
  const out: Array<{ token: string; type: string }> = [];
  for (const p of splitSemi(s)) {
    const [token, typ] = p.split(":").map((x) => x.trim());
    if (!token || !typ) continue;
    out.push({ token: token.toUpperCase(), type: typ });
  }
  return out;
}

function writeJsonIfChanged(filePath: string, obj: any, dryRun: boolean) {
  const content = JSON.stringify(obj, null, 2) + "\n";
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (existing === content) {
    console.log(`[OK] JSON unchanged: ${filePath}`);
    return;
  }
  if (dryRun) {
    console.log(`[DRY] Would write JSON -> ${filePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`[WRITE] JSON updated: ${filePath}`);
}

const TIER_POINTS: Record<string, number> = { PRIMARY: 6, SECONDARY: 4, BENIGN: 3 };

function dxLabel(dx: string, tier: string): string {
  const pretty = dx.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${pretty} (${tier.toLowerCase()} - auto-generated)`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const seedAbs = path.isAbsolute(args.seedPath) ? args.seedPath : path.join(root, args.seedPath);

  if (!fs.existsSync(seedAbs)) throw new Error(`Seed not found: ${seedAbs}`);

  const PROFILE_PACKS = path.join(root, "data", "complaints", "profile_packs.json");
  const APPLY_SEED = path.join(root, "data", "complaints", "profile_apply_seed.csv");

  const seed = readCsv(seedAbs);
  const needHeaders = [
    "FAMILY_ID", "PROFILE_ID", "SYSTEM", "CLUSTER_PREFIX", "CC_IDS",
    "DIFFERENTIALS_PRIMARY", "DIFFERENTIALS_SECONDARY", "DIFFERENTIALS_BENIGN", "QUESTIONS",
  ];
  for (const h of needHeaders) {
    if (!seed.headers.includes(h)) throw new Error(`family_seed.csv missing header: ${h}`);
  }

  const packs: Record<string, any> = fs.existsSync(PROFILE_PACKS)
    ? JSON.parse(fs.readFileSync(PROFILE_PACKS, "utf8"))
    : {};

  let applyHeaders = ["CC_ID", "PROFILE_ID"];
  let applyRows: Record<string, string>[] = [];
  if (fs.existsSync(APPLY_SEED)) {
    const apply = readCsv(APPLY_SEED);
    applyHeaders = apply.headers.length ? apply.headers : applyHeaders;
    applyRows = apply.rows;
  }
  const applyKey = new Set(applyRows.map((r) => `${r.CC_ID}||${r.PROFILE_ID}`));

  const qOutRows: Record<string, string>[] = [];
  const qOutHeaders = ["CC_ID", "Q_ID", "ANSWER_TYPE", "SOURCE_FAMILY", "PROFILE_ID"];

  let profilesAdded = 0;
  let applyAdded = 0;

  for (const r of seed.rows) {
    const familyId = (r.FAMILY_ID ?? "").trim();
    const profileId = (r.PROFILE_ID ?? "").trim();
    const clusterPrefix = (r.CLUSTER_PREFIX ?? "").trim();
    const ccIds = splitSemi(r.CC_IDS ?? "");
    const dxP = splitSemi(r.DIFFERENTIALS_PRIMARY ?? "");
    const dxS = splitSemi(r.DIFFERENTIALS_SECONDARY ?? "");
    const dxB = splitSemi(r.DIFFERENTIALS_BENIGN ?? "");
    const qPacked = (r.QUESTIONS ?? "").trim();

    if (!familyId || !profileId || !clusterPrefix || ccIds.length === 0) continue;

    const primaryCcId = ccIds[0];

    if (!packs[profileId]) {
      const activate: any[] = [];

      for (const dx of dxP) {
        activate.push({
          dx,
          when: "false",
          points: TIER_POINTS.PRIMARY,
          label: dxLabel(dx, "PRIMARY"),
        });
      }
      for (const dx of dxS) {
        activate.push({
          dx,
          when: "false",
          points: TIER_POINTS.SECONDARY,
          label: dxLabel(dx, "SECONDARY"),
        });
      }
      for (const dx of dxB) {
        activate.push({
          dx,
          when: "true",
          points: TIER_POINTS.BENIGN,
          label: dxLabel(dx, "BENIGN"),
        });
      }

      packs[profileId] = {
        cc_id: primaryCcId,
        cluster_prefix: clusterPrefix,
        activate,
      };
      profilesAdded++;
      console.log(`[ADD] Profile: ${profileId} (${activate.length} targets)`);
    } else {
      console.log(`[SKIP] Profile already exists: ${profileId}`);
    }

    for (const ccId of ccIds) {
      const k = `${ccId}||${profileId}`;
      if (!applyKey.has(k)) {
        applyRows.push({ CC_ID: ccId, PROFILE_ID: profileId });
        applyKey.add(k);
        applyAdded++;
      }

      if (args.emitQuestionsPath && qPacked) {
        const qs = parseQuestionsPacked(qPacked);
        for (const q of qs) {
          const qId = `Q_${clusterPrefix}_${q.token}`;
          qOutRows.push({
            CC_ID: ccId,
            Q_ID: qId,
            ANSWER_TYPE: q.type === "yesno" ? "tri" : q.type,
            SOURCE_FAMILY: familyId,
            PROFILE_ID: profileId,
          });
        }
      }
    }
  }

  writeJsonIfChanged(PROFILE_PACKS, packs, args.dryRun);

  applyRows.sort((a, b) => {
    const ak = `${a.CC_ID}||${a.PROFILE_ID}`;
    const bk = `${b.CC_ID}||${b.PROFILE_ID}`;
    return ak.localeCompare(bk);
  });
  writeCsv(APPLY_SEED, applyHeaders, applyRows, args.dryRun);

  if (args.emitQuestionsPath) {
    const outAbs = path.isAbsolute(args.emitQuestionsPath)
      ? args.emitQuestionsPath
      : path.join(root, args.emitQuestionsPath);

    qOutRows.sort((a, b) => `${a.CC_ID}||${a.Q_ID}`.localeCompare(`${b.CC_ID}||${b.Q_ID}`));
    writeCsv(outAbs, qOutHeaders, qOutRows, args.dryRun);
    console.log(`[OK] Questions pack: ${outAbs} (${qOutRows.length} rows)`);
  }

  console.log("\n=== Family Pack Generation Summary ===");
  console.log(`Families processed: ${seed.rows.length}`);
  console.log(`Profiles added: ${profilesAdded}`);
  console.log(`Apply-seed rows added: ${applyAdded}`);
  if (args.dryRun) console.log("(dry run — no files changed)");
  console.log("Done.");
}

main();
