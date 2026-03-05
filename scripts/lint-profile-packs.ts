import fs from "fs";
import path from "path";

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
    const r: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? "";
    rows.push(r);
  }
  return { headers, rows };
}

function extractQIds(expr: string): string[] {
  const found = new Set<string>();
  const re = /answers\.(Q_[A-Z0-9_]+)/g;
  for (const m of expr.matchAll(re)) {
    found.add(m[1]);
  }
  return [...found];
}

type Profile = {
  cc_id: string;
  cluster_prefix: string;
  activate: Array<{ dx: string; when: string; points: number; label: string }>;
};

function main() {
  const root = process.cwd();
  const PROFILE_PATH = path.join(root, "data", "complaints", "profile_packs.json");
  const Q_PATH = path.join(root, "server", "data", "csv", "CORE_QUESTIONS.csv");

  if (!fs.existsSync(PROFILE_PATH)) throw new Error(`Missing: ${PROFILE_PATH}`);

  const profiles = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as Record<string, Profile>;
  const qs = readCsv(Q_PATH);

  const qIdsByCc = new Map<string, Set<string>>();
  for (const r of qs.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const qid = (r.Q_ID ?? "").trim();
    if (!cc || !qid) continue;
    if (!qIdsByCc.has(cc)) qIdsByCc.set(cc, new Set());
    qIdsByCc.get(cc)!.add(qid);
  }

  const errors: string[] = [];
  const warns: string[] = [];

  for (const [profileId, p] of Object.entries(profiles)) {
    if (!p.cluster_prefix || typeof p.cluster_prefix !== "string") {
      errors.push(`${profileId}: missing or invalid cluster_prefix`);
    }

    if (!p.cc_id || typeof p.cc_id !== "string") {
      errors.push(`${profileId}: missing cc_id`);
    }

    if (!Array.isArray(p.activate)) {
      errors.push(`${profileId}: missing activate[]`);
      continue;
    }

    if (p.activate.length === 0) {
      warns.push(`${profileId}: activate[] is empty`);
    }

    const seenDx = new Set<string>();

    for (const item of p.activate) {
      const dx = (item.dx ?? "").trim();
      const when = (item.when ?? "").trim();
      const points = item.points;
      const label = (item.label ?? "").trim();

      if (!dx) {
        errors.push(`${profileId}: activate entry missing dx`);
      } else {
        if (seenDx.has(dx)) errors.push(`${profileId}: duplicate dx '${dx}'`);
        seenDx.add(dx);
      }

      if (!when) warns.push(`${profileId}: empty when for dx '${dx}'`);

      if (points === undefined || points === null) {
        errors.push(`${profileId}: missing points for dx '${dx}'`);
      } else if (typeof points !== "number" || !Number.isFinite(points)) {
        errors.push(`${profileId}: non-numeric points '${points}' for dx '${dx}'`);
      }

      if (!label) warns.push(`${profileId}: empty label for dx '${dx}'`);

      if (when && p.cc_id) {
        const referencedQIds = extractQIds(when);
        const knownQIds = qIdsByCc.get(p.cc_id);

        if (knownQIds) {
          for (const qid of referencedQIds) {
            if (!knownQIds.has(qid)) {
              warns.push(`${profileId}: WHEN for '${dx}' references ${qid} not found in CORE_QUESTIONS for ${p.cc_id}`);
            }
          }
        }
      }
    }
  }

  console.log("\n=== Profile Pack Lint ===");
  console.log(`Profiles: ${Object.keys(profiles).length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warns.length}`);

  if (warns.length) {
    console.log("\nWarnings:");
    for (const w of warns.slice(0, 40)) console.log(`  WARN: ${w}`);
    if (warns.length > 40) console.log(`  ... (${warns.length - 40} more)`);
  }

  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log(`  ERROR: ${e}`);
    process.exit(1);
  }

  console.log("\nLint passed.");
  process.exit(0);
}

main();
