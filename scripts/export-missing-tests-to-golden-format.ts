/**
 * scripts/export-missing-tests-to-golden-format.ts
 *
 * Converts auto-generated missing tests into draft golden JSONL format.
 *
 * Input:
 *   data/complaints/reports/auto_generated_missing_tests.json
 *
 * Output:
 *   data/complaints/reports/generated_golden_tests.jsonl
 *
 * Usage:
 *   npx tsx scripts/export-missing-tests-to-golden-format.ts
 *   npx tsx scripts/export-missing-tests-to-golden-format.ts --out data/complaints/reports/generated_golden_tests.jsonl
 */

import fs from "fs";
import path from "path";

type Args = { inPath?: string; outPath?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") args.inPath = argv[++i];
    else if (argv[i] === "--out") args.outPath = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inPath = args.inPath
    ? path.isAbsolute(args.inPath) ? args.inPath : path.join(root, args.inPath)
    : path.join(root, "data", "complaints", "reports", "auto_generated_missing_tests.json");

  const outPath = args.outPath
    ? path.isAbsolute(args.outPath) ? args.outPath : path.join(root, args.outPath)
    : path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl");

  if (!fs.existsSync(inPath)) throw new Error(`Missing input: ${inPath}`);

  const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const tests = Array.isArray(raw.tests) ? raw.tests : [];

  const lines: string[] = [];
  let idx = 1;

  for (const t of tests) {
    const cc = t.complaint_id ?? "";
    const cluster = t.target_cluster_id ?? "";
    const synthetic = t.synthetic_answers ?? {};

    const obj = {
      test_id: `AUTO_${cc.toUpperCase()}_${String(idx).padStart(4, "0")}`,
      complaint_id: cc,
      mode: "GENERATED_DRAFT",
      input: {
        complaint_id: cc,
        answers: synthetic
      },
      expected: {
        winning_cluster_id: cluster
      },
      source: {
        kind: "auto_generated_missing_test",
        source_rule_ids: t.source_rule_ids ?? []
      },
      review_status: "PENDING_REVIEW"
    };

    lines.push(JSON.stringify(obj));
    idx++;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");

  console.log(`Exported ${tests.length} generated tests`);
  console.log(`Wrote: ${outPath}`);
}

main();
