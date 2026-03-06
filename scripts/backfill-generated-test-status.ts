/**
 * scripts/backfill-generated-test-status.ts
 *
 * Bulk update review_status for generated tests.
 *
 * Usage:
 *   npx tsx scripts/backfill-generated-test-status.ts --cc cough --status APPROVED
 *   npx tsx scripts/backfill-generated-test-status.ts --test-id AUTO_COUGH_0001 --status REJECTED
 *   npx tsx scripts/backfill-generated-test-status.ts --cc dysuria --status PENDING_REVIEW --dry-run
 */

import fs from "fs";
import path from "path";

type Args = {
  complaintIds: string[];
  testIds: string[];
  status?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    complaintIds: [],
    testIds: [],
    dryRun: argv.includes("--dry-run")
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cc") args.complaintIds.push(argv[++i]);
    else if (argv[i] === "--test-id") args.testIds.push(argv[++i]);
    else if (argv[i] === "--status") args.status = argv[++i];
  }

  if (!args.status) {
    console.error("Usage: backfill-generated-test-status.ts [--cc <id>] [--test-id <id>] --status APPROVED|REJECTED|PENDING_REVIEW");
    process.exit(2);
  }

  return args;
}

function readJsonl(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const filePath = path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl");

  const rows = readJsonl(filePath);

  const ccSet = new Set(args.complaintIds);
  const testSet = new Set(args.testIds);

  let changed = 0;

  for (const row of rows) {
    const ccMatch = ccSet.size === 0 || ccSet.has(row.complaint_id);
    const testMatch = testSet.size === 0 || testSet.has(row.test_id);

    if (ccMatch && testMatch) {
      if (row.review_status !== args.status) {
        row.review_status = args.status;
        changed++;
      }
    }
  }

  console.log(`Changed: ${changed}`);

  if (args.dryRun) return;

  fs.writeFileSync(filePath, rows.map((x) => JSON.stringify(x)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  console.log(`Updated ${filePath}`);
}

main();
