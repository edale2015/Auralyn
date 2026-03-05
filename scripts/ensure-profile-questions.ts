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
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function extractQIds(expr: string): string[] {
  const found = new Set<string>();
  const re = /answers\.(Q_[A-Z0-9_]+)/g;
  for (const m of expr.matchAll(re)) {
    found.add(m[1]);
  }
  return [...found];
}

function defaultAnswerType(qid: string): string {
  const u = qid.toUpperCase();
  if (u.includes("DUR") || u.endsWith("_DAYS") || u.endsWith("_HOURS") || u.includes("SEVERITY")) return "number";
  return "tri";
}

function qidToQuestionText(qid: string): string {
  const suffix = qid.replace(/^Q_[A-Z]+_/, "").toLowerCase().replace(/_/g, " ");
  return `Do you have ${suffix}? (auto-generated from profile)`;
}

type Profile = {
  cc_id: string;
  cluster_prefix: string;
  activate: Array<{ dx: string; when: string; points: number; label: string }>;
};

function main() {
  const root = process.cwd();
  const doApply = process.argv.includes("--apply");

  const PROFILE_PATH = path.join(root, "data", "complaints", "profile_packs.json");
  const SEED_PATH = path.join(root, "data", "complaints", "profile_apply_seed.csv");
  const Q_PATH = path.join(root, "server", "data", "csv", "CORE_QUESTIONS.csv");
  const REPORT_PATH = path.join(root, "data", "complaints", "reports", "missing_questions_suggestions.csv");

  if (!fs.existsSync(PROFILE_PATH)) throw new Error(`Missing: ${PROFILE_PATH}`);
  if (!fs.existsSync(SEED_PATH)) throw new Error(`Missing: ${SEED_PATH}`);
  if (!fs.existsSync(Q_PATH)) throw new Error(`Missing: ${Q_PATH}`);

  const profiles = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as Record<string, Profile>;
  const seed = readCsv(SEED_PATH);
  const qs = readCsv(Q_PATH);

  const qIdsByCc = new Map<string, Set<string>>();
  for (const r of qs.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const qid = (r.Q_ID ?? "").trim();
    if (!cc || !qid) continue;
    if (!qIdsByCc.has(cc)) qIdsByCc.set(cc, new Set());
    qIdsByCc.get(cc)!.add(qid);
  }

  const maxOrderByCc = new Map<string, number>();
  for (const r of qs.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const ord = parseInt(r.ASK_ORDER ?? "0", 10) || 0;
    maxOrderByCc.set(cc, Math.max(maxOrderByCc.get(cc) ?? 0, ord));
  }

  type Suggestion = { ccId: string; profileId: string; dx: string; qid: string; answerType: string; questionText: string };
  const suggestions: Suggestion[] = [];
  const toAdd: Record<string, string>[] = [];

  for (const r of seed.rows) {
    const ccId = (r.CC_ID ?? "").trim();
    const pfId = (r.PROFILE_ID ?? "").trim();
    if (!ccId || !pfId) continue;

    const profile = profiles[pfId];
    if (!profile) continue;

    const knownQIds = qIdsByCc.get(ccId) ?? new Set<string>();

    for (const item of profile.activate) {
      const referencedQIds = extractQIds(item.when);

      for (const qid of referencedQIds) {
        if (knownQIds.has(qid)) continue;

        const answerType = defaultAnswerType(qid);
        const questionText = qidToQuestionText(qid);

        suggestions.push({ ccId, profileId: pfId, dx: item.dx, qid, answerType, questionText });

        if (doApply) {
          let nextOrder = (maxOrderByCc.get(ccId) ?? 0) + 10;
          maxOrderByCc.set(ccId, nextOrder);

          toAdd.push({
            CC_ID: ccId,
            VERSION: "1",
            Q_ID: qid,
            ASK_ORDER: String(nextOrder),
            QUESTION_TEXT: questionText,
            ANSWER_TYPE: answerType,
            REQUIRED: "FALSE",
            ASK_IF: "true",
            CATEGORY: "profile_auto",
          });

          knownQIds.add(qid);
        }
      }
    }
  }

  const reportHeaders = ["CC_ID", "PROFILE_ID", "DX", "Q_ID", "ANSWER_TYPE", "QUESTION_TEXT"];
  const reportRows = suggestions.map((s) => ({
    CC_ID: s.ccId,
    PROFILE_ID: s.profileId,
    DX: s.dx,
    Q_ID: s.qid,
    ANSWER_TYPE: s.answerType,
    QUESTION_TEXT: s.questionText,
  }));

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeCsv(REPORT_PATH, reportHeaders, reportRows);

  if (doApply && toAdd.length) {
    for (const row of toAdd) qs.rows.push(row);
    writeCsv(Q_PATH, qs.headers, qs.rows);
    console.log(`\nApplied ${toAdd.length} new question rows to CORE_QUESTIONS.csv`);
  }

  console.log("\n=== Profile Question Coverage ===");
  console.log(`Profiles checked: ${seed.rows.length}`);
  console.log(`Missing questions found: ${suggestions.length}`);
  if (suggestions.length) {
    console.log("\nMissing:");
    for (const s of suggestions.slice(0, 20)) {
      console.log(`  ${s.ccId} [${s.profileId}] dx=${s.dx}: ${s.qid} (${s.answerType})`);
    }
    if (suggestions.length > 20) console.log(`  ... (${suggestions.length - 20} more)`);
  } else {
    console.log("All profile WHEN_EXPR question references exist in CORE_QUESTIONS.");
  }
  console.log(`\nSuggestions report: ${REPORT_PATH}`);
  if (!doApply && suggestions.length) {
    console.log("To auto-add missing questions: npx tsx scripts/ensure-profile-questions.ts --apply");
  }
}

main();
