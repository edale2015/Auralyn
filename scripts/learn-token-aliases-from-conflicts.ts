/**
 * scripts/learn-token-aliases-from-conflicts.ts
 *
 * Learn likely token aliases from review bundle conflict files.
 *
 * Reads:
 *   data/complaints/review/<complaint_id>/*.conflicts.csv
 *
 * Writes:
 *   data/complaints/review/<complaint_id>/learned_token_aliases.csv
 *   data/complaints/review/<complaint_id>/learned_token_aliases.json
 *
 * Usage:
 *   npx tsx scripts/learn-token-aliases-from-conflicts.ts sore_throat
 *   npx tsx scripts/learn-token-aliases-from-conflicts.ts sore_throat --min-score 0.60 --min-count 2
 */

import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  minScore: number;
  minCount: number;
};

type LearnedSuggestion = {
  emitted_token: string;
  suggested_live_token: string;
  score: number;
  support_count: number;
  strategy: string;
  source_files: string[];
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error(
      "Usage: npx tsx scripts/learn-token-aliases-from-conflicts.ts <complaint_id> [--min-score 0.60] [--min-count 2]"
    );
    process.exit(2);
  }

  let minScore = 0.60;
  let minCount = 2;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-score") minScore = Number(argv[++i] ?? "0.60");
    else if (a === "--min-count") minCount = Number(argv[++i] ?? "2");
  }

  return { complaintId, minScore, minCount };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
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
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }

  return { headers, rows };
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    const cols = headers.map((h) => {
      const v = row[h] ?? "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    });
    lines.push(cols.join(","));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function normalizeToken(t: string): string {
  return (t ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function softNormalize(t: string): string {
  return normalizeToken(t).replace(/_/g, "").replace(/S$/, "");
}

function tokenizeExpr(expr: string): string[] {
  const s = (expr ?? "").toUpperCase();
  const found = new Set<string>();
  const re = /\b[A-Z][A-Z0-9_]{1,40}\b/g;

  for (const m of s.matchAll(re)) {
    const tok = m[0];
    if (["ANY", "ALL", "NOT", "TRUE", "FALSE", "ER", "PCP", "URGENT", "SELF_CARE"].includes(tok)) continue;
    if (/^\d+$/.test(tok)) continue;
    found.add(tok);
  }

  return [...found];
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const sa = softNormalize(a);
  const sb = softNormalize(b);
  if (sa === sb) return 0.97;
  if (sa.includes(sb) || sb.includes(sa)) return 0.82;
  const dist = levenshtein(sa, sb);
  const maxLen = Math.max(sa.length, sb.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}

function acronymScore(a: string, b: string): number {
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  const ac = na.split("_").map((x) => x[0] ?? "").join("");
  const bc = nb.split("_").map((x) => x[0] ?? "").join("");

  if (!ac || !bc) return 0;
  if (ac === nb || bc === na) return 0.9;
  if (ac === bc) return 0.8;
  return 0;
}

function scorePair(emitted: string, live: string): { score: number; strategy: string } {
  const e = normalizeToken(emitted);
  const l = normalizeToken(live);

  if (e === l) return { score: 1.0, strategy: "exact" };

  const se = softNormalize(e);
  const sl = softNormalize(l);

  if (se === sl) return { score: 0.97, strategy: "soft_normalized" };

  const ac = acronymScore(e, l);
  if (ac > 0) return { score: ac, strategy: "acronym" };

  if (se.includes(sl) || sl.includes(se)) return { score: 0.82, strategy: "containment" };

  const sim = similarity(e, l);
  if (sim >= 0.75) return { score: sim, strategy: "edit_distance" };

  return { score: sim, strategy: "weak" };
}

function extractComparableTokens(row: Record<string, string>): Array<{ live: string; draft: string }> {
  const pairs: Array<{ live: string; draft: string }> = [];

  for (const [k, liveVal] of Object.entries(row)) {
    if (!k.startsWith("LIVE_")) continue;

    const suffix = k.replace(/^LIVE_/, "");
    const dk = `DRAFT_${suffix}`;
    const draftVal = row[dk];
    if (!draftVal) continue;

    if (suffix === "Q_ID") {
      const liveParts = liveVal.split("_");
      const draftParts = draftVal.split("_");
      const liveTok = normalizeToken(liveParts.slice(2).join("_"));
      const draftTok = normalizeToken(draftParts.slice(2).join("_"));
      if (liveTok && draftTok && liveTok !== draftTok) {
        pairs.push({ live: liveTok, draft: draftTok });
      }
      continue;
    }

    if (suffix === "EVIDENCE_LABEL") {
      const liveTok = normalizeToken(liveVal);
      const draftTok = normalizeToken(draftVal);
      if (liveTok && draftTok && liveTok !== draftTok) {
        pairs.push({ live: liveTok, draft: draftTok });
      }
      continue;
    }

    if (["WHEN_EXPR", "TRIGGER_EXPR", "ASK_IF"].includes(suffix)) {
      const liveToks = tokenizeExpr(liveVal);
      const draftToks = tokenizeExpr(draftVal);

      for (const dt of draftToks) {
        for (const lt of liveToks) {
          if (dt === lt) continue;
          pairs.push({ live: lt, draft: dt });
        }
      }
    }
  }

  return pairs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const reviewDir = path.join(root, "data", "complaints", "review", args.complaintId);

  if (!fs.existsSync(reviewDir)) throw new Error(`Review dir not found: ${reviewDir}`);

  const conflictFiles = fs
    .readdirSync(reviewDir)
    .filter((f) => f.endsWith(".conflicts.csv"))
    .map((f) => path.join(reviewDir, f));

  if (conflictFiles.length === 0) {
    console.log(`No conflict files found in ${reviewDir}`);
    console.log("Run review-emitted-drafts.ts first to generate conflict files.");
    return;
  }

  const learned = new Map<
    string,
    {
      emitted_token: string;
      suggested_live_token: string;
      best_score: number;
      strategy: string;
      support_count: number;
      source_files: Set<string>;
    }
  >();

  for (const filePath of conflictFiles) {
    const { rows } = readCsv(filePath);
    const fileName = path.basename(filePath);

    for (const row of rows) {
      const candidates = extractComparableTokens(row);

      for (const c of candidates) {
        const { score, strategy } = scorePair(c.draft, c.live);
        if (score < args.minScore) continue;

        const key = `${normalizeToken(c.draft)}||${normalizeToken(c.live)}`;
        const existing = learned.get(key);

        if (!existing) {
          learned.set(key, {
            emitted_token: normalizeToken(c.draft),
            suggested_live_token: normalizeToken(c.live),
            best_score: score,
            strategy,
            support_count: 1,
            source_files: new Set([fileName]),
          });
        } else {
          existing.support_count += 1;
          existing.source_files.add(fileName);
          if (score > existing.best_score) {
            existing.best_score = score;
            existing.strategy = strategy;
          }
        }
      }
    }
  }

  const suggestions: LearnedSuggestion[] = [...learned.values()]
    .filter((x) => x.support_count >= args.minCount)
    .map((x) => ({
      emitted_token: x.emitted_token,
      suggested_live_token: x.suggested_live_token,
      score: x.best_score,
      support_count: x.support_count,
      strategy: x.strategy,
      source_files: [...x.source_files].sort(),
    }))
    .sort(
      (a, b) =>
        b.support_count - a.support_count ||
        b.score - a.score ||
        a.emitted_token.localeCompare(b.emitted_token)
    );

  const csvRows = suggestions.map((s) => ({
    EMITTED_TOKEN: s.emitted_token,
    SUGGESTED_LIVE_TOKEN: s.suggested_live_token,
    SCORE: s.score.toFixed(3),
    SUPPORT_COUNT: String(s.support_count),
    STRATEGY: s.strategy,
    SOURCE_FILES: s.source_files.join("|"),
  }));

  const csvPath = path.join(reviewDir, "learned_token_aliases.csv");
  const jsonPath = path.join(reviewDir, "learned_token_aliases.json");

  writeCsv(
    csvPath,
    ["EMITTED_TOKEN", "SUGGESTED_LIVE_TOKEN", "SCORE", "SUPPORT_COUNT", "STRATEGY", "SOURCE_FILES"],
    csvRows
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        complaint_id: args.complaintId,
        generated_at: new Date().toISOString(),
        min_score: args.minScore,
        min_count: args.minCount,
        suggestions,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`Learned token aliases written for ${args.complaintId}`);
  console.log(`  Conflict files scanned: ${conflictFiles.length}`);
  console.log(`  Suggestions: ${suggestions.length}`);
  console.log(`  CSV: ${csvPath}`);
  console.log(`  JSON: ${jsonPath}`);

  if (suggestions.length > 0) {
    console.log(`\n  Top learned aliases:`);
    for (const s of suggestions.slice(0, 10)) {
      console.log(
        `    ${s.emitted_token} -> ${s.suggested_live_token} (score=${s.score.toFixed(3)}, count=${s.support_count}, ${s.strategy})`
      );
    }
  }
}

main();
