/**
 * scripts/apply-suggested-token-aliases.ts
 *
 * Apply high-confidence token alias suggestions into:
 *   data/complaints/token_harmonizer.json
 *
 * Reads:
 *   data/complaints/review/<complaint_id>/token_alias_suggestions.json
 *
 * Usage:
 *   npx tsx scripts/apply-suggested-token-aliases.ts sore_throat
 *   npx tsx scripts/apply-suggested-token-aliases.ts sore_throat --min-score 0.85
 *   npx tsx scripts/apply-suggested-token-aliases.ts sore_throat --dry-run
 *   npx tsx scripts/apply-suggested-token-aliases.ts sore_throat --force
 */

import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  minScore: number;
  dryRun: boolean;
  force: boolean;
};

type Suggestion = {
  emitted_token: string;
  suggested_live_token: string;
  score: number;
  strategy: string;
};

type SuggestionFile = {
  complaint_id: string;
  generated_at: string;
  min_score: number;
  suggestions: Suggestion[];
};

type HarmonizerConfig = {
  token_aliases: Record<string, string>;
  action_aliases: Record<string, string>;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error(
      "Usage: npx tsx scripts/apply-suggested-token-aliases.ts <complaint_id> [--min-score 0.85] [--dry-run] [--force]"
    );
    process.exit(2);
  }

  let minScore = 0.85;
  let dryRun = false;
  let force = false;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-score") minScore = Number(argv[++i] ?? "0.85");
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
  }

  return { complaintId, minScore, dryRun, force };
}

function normalizeToken(t: string): string {
  return (t ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, obj: any, dryRun: boolean) {
  const content = JSON.stringify(obj, null, 2) + "\n";
  if (dryRun) {
    console.log(`[DRY] Would write ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, content, "utf8");
}

function backupFile(filePath: string, dryRun: boolean): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak.${ts}`;
  if (dryRun) {
    console.log(`[DRY] Would back up ${filePath} -> ${backupPath}`);
    return backupPath;
  }
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const suggestionPath = path.join(
    root,
    "data",
    "complaints",
    "review",
    args.complaintId,
    "token_alias_suggestions.json"
  );

  const harmonizerPath = path.join(root, "data", "complaints", "token_harmonizer.json");

  if (!fs.existsSync(suggestionPath)) {
    throw new Error(`Suggestion file not found: ${suggestionPath}`);
  }
  if (!fs.existsSync(harmonizerPath)) {
    throw new Error(`Harmonizer config not found: ${harmonizerPath}`);
  }

  const suggestionFile = readJson<SuggestionFile>(suggestionPath);
  const harmonizer = readJson<HarmonizerConfig>(harmonizerPath);

  const tokenAliases = { ...(harmonizer.token_aliases ?? {}) };

  let considered = 0;
  let added = 0;
  let skippedLowScore = 0;
  let skippedExisting = 0;
  let skippedCollision = 0;

  const changes: Array<{
    emitted_token: string;
    suggested_live_token: string;
    score: number;
    strategy: string;
    action: "ADD" | "SKIP_LOW_SCORE" | "SKIP_EXISTING" | "SKIP_COLLISION";
  }> = [];

  for (const s of suggestionFile.suggestions) {
    const emitted = normalizeToken(s.emitted_token);
    const live = normalizeToken(s.suggested_live_token);

    considered++;

    if (s.score < args.minScore) {
      skippedLowScore++;
      changes.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_LOW_SCORE" });
      continue;
    }

    if (tokenAliases[emitted] === live) {
      skippedExisting++;
      changes.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_EXISTING" });
      continue;
    }

    if (tokenAliases[emitted] && tokenAliases[emitted] !== live) {
      if (!args.force) {
        skippedCollision++;
        changes.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_COLLISION" });
        continue;
      }
    }

    tokenAliases[emitted] = live;
    added++;
    changes.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "ADD" });
  }

  const nextConfig: HarmonizerConfig = {
    ...harmonizer,
    token_aliases: Object.fromEntries(
      Object.entries(tokenAliases).sort(([a], [b]) => a.localeCompare(b))
    ),
  };

  console.log("\n=== Apply Suggested Token Aliases ===");
  console.log(`Complaint: ${args.complaintId}`);
  console.log(`Considered: ${considered}`);
  console.log(`Added: ${added}`);
  console.log(`Skipped (low score): ${skippedLowScore}`);
  console.log(`Skipped (existing): ${skippedExisting}`);
  console.log(`Skipped (collision): ${skippedCollision}`);

  const auditPath = path.join(
    root,
    "data",
    "complaints",
    "review",
    args.complaintId,
    "token_alias_apply_audit.json"
  );

  const audit = {
    complaint_id: args.complaintId,
    applied_at: new Date().toISOString(),
    min_score: args.minScore,
    force: args.force,
    summary: {
      considered,
      added,
      skippedLowScore,
      skippedExisting,
      skippedCollision,
    },
    changes,
  };

  if (added > 0) {
    backupFile(harmonizerPath, args.dryRun);
    writeJson(harmonizerPath, nextConfig, args.dryRun);
  } else {
    console.log("No alias changes to apply.");
  }

  writeJson(auditPath, audit, args.dryRun);
  console.log(`Audit: ${auditPath}`);
}

main();
