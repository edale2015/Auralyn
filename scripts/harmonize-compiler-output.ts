/**
 * scripts/harmonize-compiler-output.ts
 *
 * Harmonizes compiler-emitted draft CSVs to match existing engine vocabulary.
 *
 * Input:
 *   data/complaints/emitted/<complaint_id>/
 *
 * Reads:
 *   data/complaints/token_harmonizer.json
 *
 * Rewrites in place:
 *   CORE_QUESTIONS.draft.csv
 *   RED_FLAG_RULES.draft.csv
 *   CLUSTER_SCORING_RULES.draft.csv
 *   DISPOSITION_RULES.draft.csv
 *
 * Writes:
 *   harmonize_summary.json
 *
 * Usage:
 *   npx tsx scripts/harmonize-compiler-output.ts sore_throat
 *   npx tsx scripts/harmonize-compiler-output.ts sore_throat --dry-run
 */

import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  dryRun: boolean;
};

type HarmonizerConfig = {
  token_aliases: Record<string, string>;
  action_aliases: Record<string, string>;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error("Usage: npx tsx scripts/harmonize-compiler-output.ts <complaint_id> [--dry-run]");
    process.exit(2);
  }
  return { complaintId, dryRun: argv.includes("--dry-run") };
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

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[], dryRun: boolean) {
  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const r of rows) {
    const cols = headers.map((h) => {
      const v = r[h] ?? "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    });
    lines.push(cols.join(","));
  }

  if (dryRun) {
    console.log(`[DRY] Would write ${rows.length} rows -> ${filePath}`);
    return;
  }

  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceTokenInExpr(expr: string, from: string, to: string): string {
  const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
  return expr.replace(re, to);
}

function harmonizeExpr(expr: string, cfg: HarmonizerConfig, changeCounter: { count: number }) {
  let out = expr;
  for (const [from, to] of Object.entries(cfg.token_aliases)) {
    const next = replaceTokenInExpr(out, from, to);
    if (next !== out) changeCounter.count++;
    out = next;
  }
  return out;
}

function harmonizeValue(val: string, map: Record<string, string>, changeCounter: { count: number }) {
  const upper = (val ?? "").trim().toUpperCase();
  if (map[upper]) {
    if (map[upper] !== val) changeCounter.count++;
    return map[upper];
  }
  return val;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const emittedDir = path.join(root, "data", "complaints", "emitted", args.complaintId);
  const cfgPath = path.join(root, "data", "complaints", "token_harmonizer.json");

  if (!fs.existsSync(emittedDir)) throw new Error(`Emitted dir not found: ${emittedDir}`);
  if (!fs.existsSync(cfgPath)) throw new Error(`Missing harmonizer config: ${cfgPath}`);

  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as HarmonizerConfig;
  const summary: Record<string, any> = {
    complaint_id: args.complaintId,
    dry_run: args.dryRun,
    updated_at: new Date().toISOString(),
    files: {},
  };

  const files = [
    "CORE_QUESTIONS.draft.csv",
    "RED_FLAG_RULES.draft.csv",
    "CLUSTER_SCORING_RULES.draft.csv",
    "DISPOSITION_RULES.draft.csv",
  ];

  for (const file of files) {
    const filePath = path.join(emittedDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ${file}: not found, skipping`);
      continue;
    }

    const { headers, rows } = readCsv(filePath);
    const changes = { count: 0 };

    for (const row of rows) {
      if (row["Q_ID"]) {
        for (const [from, to] of Object.entries(cfg.token_aliases)) {
          const next = replaceTokenInExpr(row["Q_ID"], from, to);
          if (next !== row["Q_ID"]) changes.count++;
          row["Q_ID"] = next;
        }
      }

      for (const col of ["ASK_IF", "TRIGGER_EXPR", "WHEN_EXPR"]) {
        if (row[col]) row[col] = harmonizeExpr(row[col], cfg, changes);
      }

      for (const col of ["EVIDENCE_LABEL"]) {
        if (row[col]) row[col] = harmonizeValue(row[col], cfg.token_aliases, changes);
      }

      for (const col of ["SEVERITY", "ACTION", "DISPOSITION_LEVEL"]) {
        if (row[col]) row[col] = harmonizeValue(row[col], cfg.action_aliases, changes);
      }
    }

    writeCsv(filePath, headers, rows, args.dryRun);
    summary.files[file] = {
      rows: rows.length,
      changes: changes.count,
    };
  }

  const outSummary = path.join(emittedDir, "harmonize_summary.json");
  if (args.dryRun) {
    console.log(`[DRY] Would write summary -> ${outSummary}`);
  } else {
    fs.writeFileSync(outSummary, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  console.log(`\nHarmonization complete for ${args.complaintId}`);
  for (const [file, meta] of Object.entries(summary.files)) {
    console.log(`  ${file}: ${(meta as any).changes} changes across ${(meta as any).rows} rows`);
  }
}

main();
