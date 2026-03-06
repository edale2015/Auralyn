/**
 * scripts/suggest-token-aliases.ts
 *
 * Suggest likely token aliases between compiler-emitted draft tokens
 * and the live engine vocabulary.
 *
 * Usage:
 *   npx tsx scripts/suggest-token-aliases.ts sore_throat
 *   npx tsx scripts/suggest-token-aliases.ts sore_throat --min-score 0.55
 */

import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  minScore: number;
};

type Suggestion = {
  emitted_token: string;
  suggested_live_token: string;
  score: number;
  strategy: string;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error("Usage: npx tsx scripts/suggest-token-aliases.ts <complaint_id> [--min-score 0.55]");
    process.exit(2);
  }

  let minScore = 0.55;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--min-score") {
      minScore = Number(argv[++i] ?? "0.55");
    }
  }

  return { complaintId, minScore };
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
  return normalizeToken(t)
    .replace(/_/g, "")
    .replace(/S$/, "");
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

  const softE = softNormalize(e);
  const softL = softNormalize(l);

  if (softE === softL) return { score: 0.97, strategy: "soft_normalized" };

  const ac = acronymScore(e, l);
  if (ac > 0) return { score: ac, strategy: "acronym" };

  if (softE.includes(softL) || softL.includes(softE)) {
    return { score: 0.82, strategy: "containment" };
  }

  const sim = similarity(e, l);
  if (sim >= 0.75) return { score: sim, strategy: "edit_distance" };

  return { score: sim, strategy: "weak" };
}

function collectDraftTokens(emittedDir: string): Set<string> {
  const files = [
    "CORE_QUESTIONS.draft.csv",
    "RED_FLAG_RULES.draft.csv",
    "CLUSTER_SCORING_RULES.draft.csv",
    "DISPOSITION_RULES.draft.csv",
  ];

  const out = new Set<string>();

  for (const file of files) {
    const p = path.join(emittedDir, file);
    const { rows } = readCsv(p);

    for (const row of rows) {
      for (const col of ["Q_ID", "ASK_IF", "TRIGGER_EXPR", "WHEN_EXPR", "EVIDENCE_LABEL"]) {
        if (!row[col]) continue;

        if (col === "Q_ID") {
          const parts = row[col].split("_");
          if (parts.length >= 3) {
            const tok = parts.slice(2).join("_");
            if (tok) out.add(normalizeToken(tok));
          }
        } else if (col === "EVIDENCE_LABEL") {
          out.add(normalizeToken(row[col]));
        } else {
          for (const tok of tokenizeExpr(row[col])) out.add(tok);
        }
      }
    }
  }

  return out;
}

function collectLiveTokens(root: string): Set<string> {
  const files = [
    path.join(root, "server", "data", "csv", "CORE_QUESTIONS.csv"),
    path.join(root, "server", "data", "csv", "RED_FLAG_RULES.csv"),
    path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv"),
    path.join(root, "server", "data", "csv", "DISPOSITION_RULES.csv"),
  ];

  const out = new Set<string>();

  for (const file of files) {
    const { rows } = readCsv(file);

    for (const row of rows) {
      for (const col of ["Q_ID", "ASK_IF", "TRIGGER_EXPR", "WHEN_EXPR", "EVIDENCE_LABEL"]) {
        if (!row[col]) continue;

        if (col === "Q_ID") {
          const parts = row[col].split("_");
          if (parts.length >= 3) {
            const tok = parts.slice(2).join("_");
            if (tok) out.add(normalizeToken(tok));
          }
        } else if (col === "EVIDENCE_LABEL") {
          out.add(normalizeToken(row[col]));
        } else {
          for (const tok of tokenizeExpr(row[col])) out.add(tok);
        }
      }
    }
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const emittedDir = path.join(root, "data", "complaints", "emitted", args.complaintId);
  const reviewDir = path.join(root, "data", "complaints", "review", args.complaintId);

  if (!fs.existsSync(emittedDir)) throw new Error(`Emitted dir not found: ${emittedDir}`);

  const emitted = [...collectDraftTokens(emittedDir)].sort();
  const live = [...collectLiveTokens(root)].sort();

  const liveSet = new Set(live);
  const suggestions: Suggestion[] = [];

  for (const et of emitted) {
    if (liveSet.has(et)) continue;

    let best: Suggestion | null = null;

    for (const lt of live) {
      const { score, strategy } = scorePair(et, lt);
      if (!best || score > best.score) {
        best = {
          emitted_token: et,
          suggested_live_token: lt,
          score,
          strategy,
        };
      }
    }

    if (best && best.score >= args.minScore) {
      suggestions.push(best);
    }
  }

  suggestions.sort((a, b) => b.score - a.score || a.emitted_token.localeCompare(b.emitted_token));

  const csvRows = suggestions.map((s) => ({
    EMITTED_TOKEN: s.emitted_token,
    SUGGESTED_LIVE_TOKEN: s.suggested_live_token,
    SCORE: s.score.toFixed(3),
    STRATEGY: s.strategy,
  }));

  const csvPath = path.join(reviewDir, "token_alias_suggestions.csv");
  const jsonPath = path.join(reviewDir, "token_alias_suggestions.json");

  writeCsv(csvPath, ["EMITTED_TOKEN", "SUGGESTED_LIVE_TOKEN", "SCORE", "STRATEGY"], csvRows);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        complaint_id: args.complaintId,
        generated_at: new Date().toISOString(),
        min_score: args.minScore,
        suggestions,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`Token alias suggestions written for ${args.complaintId}`);
  console.log(`  Suggestions: ${suggestions.length}`);
  console.log(`  CSV: ${csvPath}`);
  console.log(`  JSON: ${jsonPath}`);

  if (suggestions.length > 0) {
    console.log(`\n  Top suggestions:`);
    for (const s of suggestions.slice(0, 10)) {
      console.log(`    ${s.emitted_token} -> ${s.suggested_live_token} (${s.score.toFixed(3)}, ${s.strategy})`);
    }
  }
}

main();
