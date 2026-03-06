/**
 * scripts/phase-readiness-report.ts
 *
 * One-shot readiness report for the current compiler/harmonizer/test-generation phase.
 *
 * Usage:
 *   npx tsx scripts/phase-readiness-report.ts
 */

import fs from "fs";
import path from "path";

function exists(p: string) {
  return fs.existsSync(p);
}

function main() {
  const root = process.cwd();

  const required = [
    "scripts/compile-guideline-to-ir.ts",
    "scripts/normalize-ir.ts",
    "scripts/emit-ir-to-csvs.ts",
    "scripts/suggest-token-aliases.ts",
    "scripts/apply-suggested-token-aliases.ts",
    "scripts/harmonize-compiler-output.ts",
    "scripts/review-emitted-drafts.ts",
    "scripts/merge-approved-drafts.ts",
    "scripts/learn-token-aliases-from-conflicts.ts",
    "scripts/promote-learned-aliases.ts",
    "scripts/engine-coverage-audit.ts",
    "scripts/auto-generate-missing-tests.ts",
    "scripts/export-missing-tests-to-golden-format.ts",
    "scripts/validate-generated-golden-tests.ts",
    "scripts/promote-approved-generated-tests.ts",
    "scripts/merge-generated-tests-into-harness.ts",
    "scripts/merge-generated-tests-into-real-complaint-folders.ts",
    "scripts/build-harness-manifest.ts",
    "scripts/runtime-audit-to-coverage.ts",
    "scripts/priority-refinement-report.ts",
    "scripts/classify-dead-clusters.ts",
    "scripts/analyze-rule-contradictions.ts",
    "data/complaints/token_harmonizer.json"
  ];

  const present = required.filter((p) => exists(path.join(root, p)));
  const missing = required.filter((p) => !exists(path.join(root, p)));

  const report = {
    generated_at: new Date().toISOString(),
    present_count: present.length,
    missing_count: missing.length,
    present,
    missing,
    artifacts: {
      generated_tests: exists(path.join(root, "data", "complaints", "reports", "generated_golden_tests.jsonl")),
      approved_generated_tests: exists(path.join(root, "data", "complaints", "reports", "approved_generated_golden_tests.jsonl")),
      engine_coverage_audit: exists(path.join(root, "data", "complaints", "reports", "engine_coverage_audit.csv")),
      dead_rules: exists(path.join(root, "data", "complaints", "reports", "dead_rules.csv")),
      rule_contradictions: exists(path.join(root, "data", "complaints", "reports", "rule_contradictions.csv")),
      runtime_audit: exists(path.join(root, "data", "complaints", "runtime", "engine_runtime_audit.csv")),
      harness_manifest: exists(path.join(root, "data", "complaints", "reports", "harness_manifest.json"))
    }
  };

  const outPath = path.join(root, "data", "complaints", "reports", "phase_readiness_report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`Present: ${report.present_count}`);
  console.log(`Missing: ${report.missing_count}`);
}

main();
