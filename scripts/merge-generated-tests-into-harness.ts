/**
 * scripts/merge-generated-tests-into-harness.ts
 *
 * Merge approved generated tests into a real harness JSONL file.
 *
 * Input:
 *   data/complaints/reports/generated_golden_tests.jsonl
 *
 * Target:
 *   tests/golden/generated_append.jsonl (default, override with --target)
 *
 * Rules:
 * - only APPROVED tests are merged by default
 * - idempotent by test_id
 * - backup target before write
 *
 * Usage:
 *   npx tsx scripts/merge-generated-tests-into-harness.ts
 *   npx tsx scripts/merge-generated-tests-into-harness.ts --target tests/golden/all_generated.jsonl
 *   npx tsx scripts/merge-generated-tests-into-harness.ts --cc cough --dry-run
 */

import fs from "fs";
import path from "path";

type Args = {
  inputPath?: string;
  targetPath?: string;
  complaintIds: string[];
  dryRun: boolean;
  includePending: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    complaintIds: [],
    dryRun: argv.includes("--dry-run"),
    includePending: argv.includes("--include-pending"),
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.inputPath = argv[++i];
    else if (argv[i] === "--target") args.targetPath = argv[++i];
    else if (argv[i] === "--cc") args.complaintIds.push(argv[++i]);
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

function backupFile(filePath: string, dryRun: boolean): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${filePath}.bak.${ts}`;
  if (dryRun) {
    console.log(`[DRY] Would back up ${filePath} -> ${backup}`);
    return backup;
  }
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backup);
  return backup;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inputPath = args.inputPath
    ? path.isAbsolute(args.inputPath) ? args.inputPath : path.join(root, args.inputPath)
    : path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl");

  const targetPath = args.targetPath
    ? path.isAbsolute(args.targetPath) ? args.targetPath : path.join(root, args.targetPath)
    : path.join(root, "tests", "golden", "generated_append.jsonl");

  const incoming = readJsonl(inputPath);
  const existing = readJsonl(targetPath);

  const allowedStatuses = args.includePending
    ? new Set(["APPROVED", "PENDING_REVIEW"])
    : new Set(["APPROVED"]);

  let filtered = incoming.filter((x) => allowedStatuses.has(x.review_status ?? "PENDING_REVIEW"));

  if (args.complaintIds.length) {
    const set = new Set(args.complaintIds);
    filtered = filtered.filter((x) => set.has(x.complaint_id));
  }

  const existingIds = new Set(existing.map((x) => x.test_id));
  const toAdd = filtered.filter((x) => !existingIds.has(x.test_id));

  console.log("\n=== Merge Generated Tests Into Harness ===");
  console.log(`Input: ${incoming.length}`);
  console.log(`Eligible: ${filtered.length}`);
  console.log(`Already present: ${filtered.length - toAdd.length}`);
  console.log(`To append: ${toAdd.length}`);

  if (!toAdd.length) return;

  if (args.dryRun) return;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  backupFile(targetPath, false);

  const payload = toAdd.map((x) => JSON.stringify(x)).join("\n");
  const prefix = fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0 ? "\n" : "";
  fs.appendFileSync(targetPath, prefix + payload + "\n", "utf8");

  console.log(`Appended ${toAdd.length} tests to ${targetPath}`);
}

main();
