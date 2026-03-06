/**
 * scripts/promote-learned-aliases.ts
 *
 * Promote learned alias suggestions into token_harmonizer.json
 *
 * Input:
 *   data/complaints/review/<complaint_id>/learned_token_aliases.json
 *
 * Output:
 *   data/complaints/token_harmonizer.json
 *
 * Usage:
 *   npx tsx scripts/promote-learned-aliases.ts sore_throat
 *   npx tsx scripts/promote-learned-aliases.ts sore_throat --min-score 0.80 --min-count 2
 *   npx tsx scripts/promote-learned-aliases.ts sore_throat --dry-run
 *   npx tsx scripts/promote-learned-aliases.ts sore_throat --force
 */

import fs from "fs";
import path from "path";

type Args = {
  complaintId: string;
  minScore: number;
  minCount: number;
  dryRun: boolean;
  force: boolean;
};

type LearnedSuggestion = {
  emitted_token: string;
  suggested_live_token: string;
  score: number;
  support_count: number;
  strategy: string;
};

type LearnedFile = {
  complaint_id: string;
  generated_at: string;
  suggestions: LearnedSuggestion[];
};

type HarmonizerConfig = {
  token_aliases: Record<string, string>;
  action_aliases: Record<string, string>;
};

function parseArgs(argv: string[]): Args {
  const complaintId = argv[0];
  if (!complaintId || complaintId.startsWith("--")) {
    console.error(
      "Usage: npx tsx scripts/promote-learned-aliases.ts <complaint_id> [--min-score 0.80] [--min-count 2] [--dry-run] [--force]"
    );
    process.exit(2);
  }

  let minScore = 0.80;
  let minCount = 2;
  let dryRun = false;
  let force = false;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-score") minScore = Number(argv[++i] ?? "0.80");
    else if (a === "--min-count") minCount = Number(argv[++i] ?? "2");
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
  }

  return { complaintId, minScore, minCount, dryRun, force };
}

function normalizeToken(t: string): string {
  return (t ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function backupFile(filePath: string, dryRun: boolean): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${filePath}.bak.${ts}`;
  if (dryRun) {
    console.log(`[DRY] Would back up ${filePath} -> ${backup}`);
    return backup;
  }
  fs.copyFileSync(filePath, backup);
  return backup;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const learnedPath = path.join(
    root,
    "data",
    "complaints",
    "review",
    args.complaintId,
    "learned_token_aliases.json"
  );

  const harmonizerPath = path.join(
    root,
    "data",
    "complaints",
    "token_harmonizer.json"
  );

  if (!fs.existsSync(learnedPath)) {
    throw new Error(`Missing learned aliases: ${learnedPath}`);
  }
  if (!fs.existsSync(harmonizerPath)) {
    throw new Error(`Missing harmonizer config: ${harmonizerPath}`);
  }

  const learned = JSON.parse(fs.readFileSync(learnedPath, "utf8")) as LearnedFile;
  const harmonizer = JSON.parse(fs.readFileSync(harmonizerPath, "utf8")) as HarmonizerConfig;

  const aliases = { ...(harmonizer.token_aliases ?? {}) };

  let promoted = 0;
  let skippedLowScore = 0;
  let skippedLowSupport = 0;
  let skippedExisting = 0;
  let skippedCollision = 0;

  const audit: Array<{
    emitted_token: string;
    suggested_live_token: string;
    score: number;
    support_count: number;
    strategy: string;
    action: "PROMOTED" | "SKIP_LOW_SCORE" | "SKIP_LOW_SUPPORT" | "SKIP_EXISTING" | "SKIP_COLLISION";
  }> = [];

  for (const s of learned.suggestions) {
    const emitted = normalizeToken(s.emitted_token);
    const live = normalizeToken(s.suggested_live_token);

    if (s.score < args.minScore) {
      skippedLowScore++;
      audit.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_LOW_SCORE" });
      continue;
    }

    if (s.support_count < args.minCount) {
      skippedLowSupport++;
      audit.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_LOW_SUPPORT" });
      continue;
    }

    if (aliases[emitted] === live) {
      skippedExisting++;
      audit.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_EXISTING" });
      continue;
    }

    if (aliases[emitted] && aliases[emitted] !== live && !args.force) {
      skippedCollision++;
      audit.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "SKIP_COLLISION" });
      continue;
    }

    aliases[emitted] = live;
    promoted++;
    audit.push({ ...s, emitted_token: emitted, suggested_live_token: live, action: "PROMOTED" });
  }

  console.log("\n=== Promote Learned Aliases ===");
  console.log(`Complaint: ${args.complaintId}`);
  console.log(`Promoted: ${promoted}`);
  console.log(`Skipped (low score): ${skippedLowScore}`);
  console.log(`Skipped (low support): ${skippedLowSupport}`);
  console.log(`Skipped (existing): ${skippedExisting}`);
  console.log(`Skipped (collision): ${skippedCollision}`);

  const updated: HarmonizerConfig = {
    ...harmonizer,
    token_aliases: Object.fromEntries(
      Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
    ),
  };

  if (promoted > 0) {
    backupFile(harmonizerPath, args.dryRun);
    if (!args.dryRun) {
      fs.writeFileSync(harmonizerPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
    }
  } else {
    console.log("No aliases to promote.");
  }

  const auditPath = path.join(
    root,
    "data",
    "complaints",
    "review",
    args.complaintId,
    "promoted_aliases_audit.json"
  );

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.writeFileSync(
      auditPath,
      JSON.stringify(
        {
          complaint_id: args.complaintId,
          applied_at: new Date().toISOString(),
          min_score: args.minScore,
          min_support: args.minCount,
          force: args.force,
          summary: {
            promoted,
            skippedLowScore,
            skippedLowSupport,
            skippedExisting,
            skippedCollision,
          },
          results: audit,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    console.log(`Audit: ${auditPath}`);
  } else {
    console.log(`[DRY] Would write audit -> ${auditPath}`);
  }
}

main();
