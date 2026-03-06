/**
 * scripts/merge-generated-tests-into-real-complaint-folders.ts
 *
 * Merge approved generated tests into complaint-specific harness files.
 *
 * Default target:
 *   data/complaints/<complaint_id>/golden.generated.jsonl
 *
 * Usage:
 *   npx tsx scripts/merge-generated-tests-into-real-complaint-folders.ts
 *   npx tsx scripts/merge-generated-tests-into-real-complaint-folders.ts --cc cough --cc dysuria
 *   npx tsx scripts/merge-generated-tests-into-real-complaint-folders.ts --dry-run
 *   npx tsx scripts/merge-generated-tests-into-real-complaint-folders.ts --base-dir tests/complaints
 */

import fs from "fs";
import path from "path";

type Args = {
  inputPath?: string;
  baseDir?: string;
  complaintIds: string[];
  dryRun: boolean;
  includePending: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    complaintIds: [],
    dryRun: argv.includes("--dry-run"),
    includePending: argv.includes("--include-pending")
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.inputPath = argv[++i];
    else if (argv[i] === "--base-dir") args.baseDir = argv[++i];
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

  const baseDir = args.baseDir
    ? path.isAbsolute(args.baseDir) ? args.baseDir : path.join(root, args.baseDir)
    : path.join(root, "data", "complaints");

  const rows = readJsonl(inputPath);

  const allowedStatuses = args.includePending
    ? new Set(["APPROVED", "PENDING_REVIEW"])
    : new Set(["APPROVED"]);

  let filtered = rows.filter((x) => allowedStatuses.has(x.review_status ?? "PENDING_REVIEW"));

  if (args.complaintIds.length) {
    const set = new Set(args.complaintIds);
    filtered = filtered.filter((x) => set.has(x.complaint_id));
  }

  const byComplaint = new Map<string, any[]>();
  for (const row of filtered) {
    const cc = row.complaint_id;
    if (!cc) continue;
    if (!byComplaint.has(cc)) byComplaint.set(cc, []);
    byComplaint.get(cc)!.push(row);
  }

  console.log("\n=== Merge Generated Tests Into Real Complaint Folders ===");
  console.log(`Eligible tests: ${filtered.length}`);
  console.log(`Complaints touched: ${byComplaint.size}`);

  let totalAdded = 0;

  for (const [cc, tests] of byComplaint.entries()) {
    const targetDir = path.join(baseDir, cc);
    const targetFile = path.join(targetDir, "golden.generated.jsonl");

    const existing = readJsonl(targetFile);
    const existingIds = new Set(existing.map((x) => x.test_id));

    const toAdd = tests.filter((x) => !existingIds.has(x.test_id));

    console.log(`${cc}: existing=${existing.length}, incoming=${tests.length}, add=${toAdd.length}`);

    if (!toAdd.length) continue;
    totalAdded += toAdd.length;

    if (args.dryRun) continue;

    fs.mkdirSync(targetDir, { recursive: true });
    backupFile(targetFile, false);

    const payload = toAdd.map((x) => JSON.stringify(x)).join("\n");
    const prefix = fs.existsSync(targetFile) && fs.statSync(targetFile).size > 0 ? "\n" : "";
    fs.appendFileSync(targetFile, prefix + payload + "\n", "utf8");
  }

  console.log(`Total added: ${totalAdded}`);
}

main();
