import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { gateFromDigests, writeGateArtifacts } from "./stagingGate";

function run(cmd: string, args: string[], env: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} failed (${code})`))));
  });
}

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

async function main() {
  const OUT = process.env.REPORT_OUTPUT_DIR || "./reports";
  const patchCsv = path.join(OUT, "CLINICAL_RULES_PATCH_PROPOSED.csv");

  const stagingId = process.env.SHEETS_SPREADSHEET_ID_STAGING;
  if (!stagingId) throw new Error("Missing SHEETS_SPREADSHEET_ID_STAGING");
  if (!fs.existsSync(patchCsv)) throw new Error(`Patch CSV not found: ${patchCsv}`);

  const beforeDir = path.join(OUT, "staging_before");
  const afterDir = path.join(OUT, "staging_after");
  ensureDir(beforeDir);
  ensureDir(afterDir);

  const common: Record<string, string> = {
    REPORT_DAYS: process.env.REPORT_DAYS || "7",
    TESTS_PER_FLOW: process.env.TESTS_PER_FLOW || "25",
    TEST_SHEET_ENV: "staging",
  };

  console.log("=== STAGING: baseline tests (before) ===");
  await run("npx", ["tsx", "server/scripts/runNightlyTests.ts"], { ...common, REPORT_OUTPUT_DIR: beforeDir });
  await run("npx", ["tsx", "server/scripts/testRunReport.ts"],   { ...common, REPORT_OUTPUT_DIR: beforeDir });
  await run("npx", ["tsx", "server/scripts/generateDailyDigest.ts"], { ...common, REPORT_OUTPUT_DIR: beforeDir });

  console.log("=== Applying rule patch to STAGING spreadsheet ===");
  // Apply patch to staging by temporarily overriding SHEETS_SPREADSHEET_ID for the import process
  await run("npx", [
    "tsx",
    "server/scripts/sheetImport.ts",
    "CLINICAL_RULES",
    patchCsv,
    "upsert",
    "rule_key",
  ], { SHEETS_SPREADSHEET_ID: stagingId } as Record<string, string>);

  console.log("=== STAGING: tests (after) ===");
  await run("npx", ["tsx", "server/scripts/runNightlyTests.ts"], { ...common, REPORT_OUTPUT_DIR: afterDir });
  await run("npx", ["tsx", "server/scripts/testRunReport.ts"],   { ...common, REPORT_OUTPUT_DIR: afterDir });
  await run("npx", ["tsx", "server/scripts/generateDailyDigest.ts"], { ...common, REPORT_OUTPUT_DIR: afterDir });

  // Create simple promotion report
  const reportPath = path.join(OUT, "staging_promotion_report.md");
  const lines: string[] = [];
  lines.push(`# Staging Promotion Report`);
  lines.push(``);
  lines.push(`Patch applied to staging: \`${patchCsv}\``);
  lines.push(``);
  lines.push(`## Before`);
  lines.push(`- Digest: \`${path.join(beforeDir, "daily_digest.md")}\``);
  lines.push(`- HTML: \`${path.join(beforeDir, "daily_digest.html")}\``);
  lines.push(``);
  lines.push(`## After`);
  lines.push(`- Digest: \`${path.join(afterDir, "daily_digest.md")}\``);
  lines.push(`- HTML: \`${path.join(afterDir, "daily_digest.html")}\``);
  lines.push(``);
  lines.push(`## Next`);
  lines.push(`Review the BEFORE vs AFTER digests. If improved, promote the same CSV to PROD by running:`);
  lines.push("");
  lines.push("```bash");
  lines.push(`npx tsx server/scripts/sheetImport.ts CLINICAL_RULES ${patchCsv} upsert rule_key`);
  lines.push("```");

  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`Wrote: ${reportPath}`);

  // --- Regression gate ---
  const beforeDigest = path.join(beforeDir, "daily_digest.md");
  const afterDigest = path.join(afterDir, "daily_digest.md");

  const decision = gateFromDigests(beforeDigest, afterDigest);
  const { jsonPath } = writeGateArtifacts(OUT, decision);

  // Append gate result to promotion report
  const gateHeader = [
    "",
    "## Staging Regression Gate",
    `**RESULT:** ${decision.result}`,
    decision.reasons.length ? `**Reasons:** ${decision.reasons.join(" | ")}` : "**Reasons:** none",
    `Gate JSON: \`${jsonPath}\``,
    "",
  ].join("\n");

  fs.appendFileSync(reportPath, gateHeader, "utf8");
  console.log(`Gate result: ${decision.result}`);
  if (decision.reasons.length) console.log(`Gate reasons: ${decision.reasons.join(" | ")}`);

  // Optional: fail the script on regression so schedulers can alert
  const failOnRegression = (process.env.GATE_FAIL_ON_REGRESSION || "0").trim() === "1";
  if (failOnRegression && decision.result === "REGRESSION") {
    throw new Error("Staging regression gate failed");
  }
}

main().catch((e) => {
  console.error("promoteRulePatchesToStaging failed:", e);
  process.exit(1);
});
