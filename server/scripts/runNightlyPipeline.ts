import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

function run(cmd: string, args: string[], env: Record<string,string>) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

function hasNonEmptyCsv(csvPath: string): boolean {
  if (!fs.existsSync(csvPath)) return false;
  const txt = fs.readFileSync(csvPath, "utf8").trim();
  if (!txt) return false;

  // If file only contains header row, it has no proposals
  const lines = txt.split(/\r?\n/).filter(Boolean);
  return lines.length > 1;
}

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readLastHash(hashPath: string): string | null {
  if (!fs.existsSync(hashPath)) return null;
  return fs.readFileSync(hashPath, "utf8").trim() || null;
}

function writeLastHash(hashPath: string, hash: string) {
  fs.writeFileSync(hashPath, hash, "utf8");
}

async function main() {
  const DAYS = process.env.REPORT_DAYS || "7";
  const OUT = process.env.REPORT_OUTPUT_DIR || "./reports";
  const PER_FLOW = process.env.TESTS_PER_FLOW || "25";

  const env = {
    REPORT_DAYS: DAYS,
    REPORT_OUTPUT_DIR: OUT,
    TESTS_PER_FLOW: PER_FLOW,
  };

  console.log("=== Nightly Pipeline Start ===");
  console.log(`REPORT_DAYS=${DAYS} REPORT_OUTPUT_DIR=${OUT} TESTS_PER_FLOW=${PER_FLOW}`);

  // 1) Run tests
  await run("npx", ["tsx", "server/scripts/runNightlyTests.ts"], env);

  // 2) Report failures
  await run("npx", ["tsx", "server/scripts/testRunReport.ts"], env);

  // 3) Rule patch proposals (RED_FLAG_QIDS)
  await run("npx", ["tsx", "server/scripts/generatePatchProposals.ts"], env);

  // 4) Med cleanup suggestions + patch CSV
  await run("npx", ["tsx", "server/scripts/generateMedCleanupProposals.ts"], env);

  // 5) Router misroute synonyms
  await run("npx", ["tsx", "server/scripts/generateRouterSynonymSuggestions.ts"], env);

  // 6) Digest
  await run("npx", ["tsx", "server/scripts/generateDailyDigest.ts"], env);

  // 7) Auto-promote patches to STAGING (optional, safe, hash-guarded)
  const autoPromote = (process.env.AUTO_PROMOTE_TO_STAGING || "").trim() === "1";
  const stagingId = process.env.SHEETS_SPREADSHEET_ID_STAGING || "";

  const patchCsv = path.join(OUT, "CLINICAL_RULES_PATCH_PROPOSED.csv");
  const patchExists = hasNonEmptyCsv(patchCsv);

  const hashPath = path.join(OUT, ".last_patch_hash");

  if (!autoPromote) {
    console.log("=== Auto-promote to STAGING skipped (AUTO_PROMOTE_TO_STAGING != 1) ===");
  } else if (!stagingId) {
    console.log("=== Auto-promote to STAGING skipped (missing SHEETS_SPREADSHEET_ID_STAGING) ===");
  } else if (!patchExists) {
    console.log(`=== Auto-promote to STAGING skipped (no proposed rule patches at ${patchCsv}) ===`);
  } else {
    const currentHash = hashFile(patchCsv);
    const lastHash = readLastHash(hashPath);

    if (lastHash && lastHash === currentHash) {
      console.log("=== Auto-promote to STAGING skipped (patch unchanged since last run) ===");
    } else {
      console.log("=== Auto-promote to STAGING starting (new patch detected) ===");
      await run("npx", ["tsx", "server/scripts/promoteRulePatchesToStaging.ts"], env);
      writeLastHash(hashPath, currentHash);
      console.log("=== Auto-promote to STAGING finished; hash updated ===");
    }
  }

  console.log("=== Nightly Pipeline complete ===");
}

main().catch((e) => {
  console.error("runNightlyPipeline failed:", e);
  process.exit(1);
});
