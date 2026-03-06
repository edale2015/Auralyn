/**
 * scripts/validate-generated-golden-tests.ts
 *
 * Validate generated golden tests JSONL.
 *
 * Usage:
 *   npx tsx scripts/validate-generated-golden-tests.ts
 *   npx tsx scripts/validate-generated-golden-tests.ts --input data/complaints/reports/generated_golden_tests.jsonl
 */

import fs from "fs";
import path from "path";

type Args = { inputPath?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.inputPath = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const inputPath = args.inputPath
    ? path.isAbsolute(args.inputPath) ? args.inputPath : path.join(root, args.inputPath)
    : path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl");

  if (!fs.existsSync(inputPath)) throw new Error(`Missing input: ${inputPath}`);

  const lines = fs.readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const errors: string[] = [];
  const ids = new Set<string>();

  lines.forEach((line, idx) => {
    try {
      const obj = JSON.parse(line);
      const n = idx + 1;

      if (!obj.test_id) errors.push(`line ${n}: missing test_id`);
      if (!obj.complaint_id) errors.push(`line ${n}: missing complaint_id`);
      if (!obj.input?.answers || typeof obj.input.answers !== "object") errors.push(`line ${n}: missing input.answers`);
      if (!obj.expected?.winning_cluster_id) errors.push(`line ${n}: missing expected.winning_cluster_id`);

      if (obj.test_id) {
        if (ids.has(obj.test_id)) errors.push(`line ${n}: duplicate test_id ${obj.test_id}`);
        ids.add(obj.test_id);
      }
    } catch (e: any) {
      errors.push(`line ${idx + 1}: invalid JSON (${e?.message ?? String(e)})`);
    }
  });

  console.log(`Lines: ${lines.length}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length) {
    console.log("\nErrors:");
    errors.slice(0, 50).forEach((e) => console.log(`- ${e}`));
    process.exit(1);
  }

  console.log("generated golden tests valid");
}

main();
