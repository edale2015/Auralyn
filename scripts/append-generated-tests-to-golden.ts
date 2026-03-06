/**
 * scripts/append-generated-tests-to-golden.ts
 *
 * Appends approved generated tests into a golden harness JSONL file.
 *
 * Input:
 *   data/complaints/reports/generated_golden_tests.jsonl
 *
 * Output:
 *   appends to target golden JSONL
 *
 * Usage:
 *   npx tsx scripts/append-generated-tests-to-golden.ts --target tests/golden/generated_append.jsonl
 */

import fs from "fs";
import path from "path";

type Args = {
  inputPath?: string;
  targetPath?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: argv.includes("--dry-run") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.inputPath = argv[++i];
    else if (argv[i] === "--target") args.targetPath = argv[++i];
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

  const inputPath = args.inputPath
    ? path.isAbsolute(args.inputPath) ? args.inputPath : path.join(root, args.inputPath)
    : path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl");

  const targetPath = args.targetPath
    ? path.isAbsolute(args.targetPath) ? args.targetPath : path.join(root, args.targetPath)
    : path.join(root, "tests", "golden", "generated_append.jsonl");

  const incoming = readJsonl(inputPath);
  const existing = readJsonl(targetPath);

  const existingIds = new Set(existing.map((x) => x.test_id));
  const approved = incoming.filter((x) => x.review_status === "APPROVED" || x.review_status === "PENDING_REVIEW");
  const toAdd = approved.filter((x) => !existingIds.has(x.test_id));

  console.log(`Incoming: ${incoming.length}`);
  console.log(`Approved-ish: ${approved.length}`);
  console.log(`To append: ${toAdd.length}`);

  if (args.dryRun) return;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const lines = toAdd.map((x) => JSON.stringify(x)).join("\n");
  if (lines) {
    fs.appendFileSync(targetPath, (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0 ? "\n" : "") + lines + "\n", "utf8");
  }

  console.log(`Appended to ${targetPath}`);
}

main();
