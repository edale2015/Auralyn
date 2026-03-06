/**
 * scripts/build-harness-manifest.ts
 *
 * Build a manifest of complaint harness files and test counts.
 *
 * Usage:
 *   npx tsx scripts/build-harness-manifest.ts
 *   npx tsx scripts/build-harness-manifest.ts --base-dir data/complaints
 */

import fs from "fs";
import path from "path";

type Args = { baseDir?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-dir") args.baseDir = argv[++i];
  }
  return args;
}

function countJsonl(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const baseDir = args.baseDir
    ? path.isAbsolute(args.baseDir) ? args.baseDir : path.join(root, args.baseDir)
    : path.join(root, "data", "complaints");

  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const rows: any[] = [];

  for (const cc of dirs) {
    const dir = path.join(baseDir, cc);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    if (!files.length) continue;

    let total = 0;
    for (const f of files) {
      const n = countJsonl(path.join(dir, f));
      total += n;
      rows.push({
        complaint_id: cc,
        file: f,
        test_count: n
      });
    }

    rows.push({
      complaint_id: cc,
      file: "__TOTAL__",
      test_count: total
    });
  }

  const outPath = path.join(root, "data", "complaints", "reports", "harness_manifest.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    rows
  }, null, 2) + "\n", "utf8");

  console.log(`Wrote harness manifest: ${outPath}`);
  console.log(`Rows: ${rows.length}`);
}

main();
