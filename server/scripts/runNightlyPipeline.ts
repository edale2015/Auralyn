import { spawn } from "child_process";

function run(cmd: string, args: string[], env: Record<string,string>) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
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

  console.log("=== Nightly Pipeline complete ===");
}

main().catch((e) => {
  console.error("runNightlyPipeline failed:", e);
  process.exit(1);
});
