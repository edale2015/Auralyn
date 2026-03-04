import fs from "node:fs";
import { loadCrossComplaintBoosts, applyCrossComplaintBoosts, resetCrossBoostCache } from "../server/engines/crossComplaintBoostEngine";

const RULES_PATH = "server/data/csv/CROSS_COMPLAINT_BOOSTS.csv";
const GOLDENS_PATH = "server/data/csv/CROSS_COMPLAINT_GOLDENS.jsonl";

function readJsonl(p: string): any[] {
  const lines = fs.readFileSync(p, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
  return lines.map(l => JSON.parse(l));
}

function main() {
  resetCrossBoostCache();
  const rules = loadCrossComplaintBoosts(RULES_PATH);
  const goldens = readJsonl(GOLDENS_PATH);

  const fails: string[] = [];

  for (const g of goldens) {
    const { scores: outScores, adjustments } = applyCrossComplaintBoosts({
      complaintSlug: g.complaintSlug,
      anyAnswers: g.anyAnswers ?? {},
      rules,
      scores: g.baseScores ?? {},
    });

    const gotRuleIds = adjustments.map((a) => a.ruleId).sort();
    const wantRuleIds = (g.expect.adjustRuleIds ?? []).slice().sort();

    const okRules = JSON.stringify(gotRuleIds) === JSON.stringify(wantRuleIds);
    const target = g.expect.targetDx;
    const base = Number((g.baseScores ?? {})[target] ?? 0);
    const after = Number(outScores[target] ?? 0);
    const minAdded = Number(g.expect.minAddedPoints ?? 0);

    const okDelta = (after - base) >= minAdded;

    if (!okRules || !okDelta) {
      fails.push(
        `${g.id} FAIL\n` +
        `  expected rules=${JSON.stringify(wantRuleIds)} minAdded=${minAdded} target=${target}\n` +
        `  got      rules=${JSON.stringify(gotRuleIds)} delta=${after - base} outScore=${after}`
      );
    } else {
      console.log(`  PASS ${g.id}`);
    }
  }

  if (fails.length) {
    console.error(`\nCROSS-COMPLAINT GOLDENS FAIL (${fails.length}/${goldens.length})`);
    for (const f of fails.slice(0, 50)) console.error(f);
    process.exit(1);
  }

  console.log(`\nCROSS-COMPLAINT GOLDENS PASS (${goldens.length}/${goldens.length})`);
  process.exit(0);
}

main();
