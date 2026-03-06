/**
 * scripts/promote-approved-generated-tests.ts
 *
 * Filter generated tests into an approved-only JSONL file.
 *
 * Usage:
 *   npx tsx scripts/promote-approved-generated-tests.ts
 *   npx tsx scripts/promote-approved-generated-tests.ts --cc cough --cc dysuria
 */

import fs from "fs";
import path from "path";

type Args = {
  inputPath?: string;
  outPath?: string;
  complaintIds: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { complaintIds: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.inputPath = argv[++i];
    else if (argv[i] === "--out") args.outPath = argv[++i];
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inputPath = args.inputPath
    ? path.isAbsolute(args.inputPath) ? args.inputPath : path.join(root, args.inputPath)
    : path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl");

  const outPath = args.outPath
    ? path.isAbsolute(args.outPath) ? args.outPath : path.join(root, args.outPath)
    : path.join(root, "data", "complaints", "reports", "approved_generated_golden_tests.jsonl");

  let rows = readJsonl(inputPath).filter((x) => x.review_status === "APPROVED");

  if (args.complaintIds.length) {
    const set = new Set(args.complaintIds);
    rows = rows.filter((x) => set.has(x.complaint_id));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rows.map((x) => JSON.stringify(x)).join("\n") + (rows.length ? "\n" : ""), "utf8");

  console.log(`Wrote ${rows.length} approved tests to ${outPath}`);
}

main();
