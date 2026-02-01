import fs from "fs";
import path from "path";
import { FLOW_SPECS } from "../testing/specs";

async function main() {
  const outDir = process.env.REPORT_OUTPUT_DIR || "./reports";
  const outPath = path.join(outDir, "CLINICAL_RULES_RED_FLAG_QIDS_PATCH.csv");

  const headers = ["flow_id", "rule_key", "value", "active"];
  const rows: string[][] = [headers];

  for (const spec of FLOW_SPECS) {
    if (!spec.redFlagYesQuestionIds.length) continue;

    rows.push([
      spec.flowId,
      "RED_FLAG_QIDS",
      spec.redFlagYesQuestionIds.join(","),
      "Y",
    ]);
  }

  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, csv, "utf8");

  console.log(`Generated ${rows.length - 1} RED_FLAG_QIDS rows`);
  console.log(`Output: ${outPath}`);
  console.log("\nTo import, run:");
  console.log(`npx tsx server/scripts/sheetImport.ts CLINICAL_RULES ${outPath} append`);
}

main().catch(e => {
  console.error("generateRedFlagQidsPatch failed:", e);
  process.exit(1);
});
