import fs from "node:fs";
import { loadConsistencyRules, computeConsistencyFlags } from "../server/engines/consistencyEngine";

const RULES_PATH = "server/data/csv/CONSISTENCY_RULES.csv";
const GOLDENS_PATH = "server/data/csv/CONSISTENCY_GOLDENS.jsonl";

function readJsonl(p: string): any[] {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  const lines = fs.readFileSync(p, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
  return lines.map(l => JSON.parse(l));
}

function setEq(a: string[], b: string[]) {
  const A = [...new Set(a)].sort();
  const B = [...new Set(b)].sort();
  return JSON.stringify(A) === JSON.stringify(B);
}

function main() {
  const rules = loadConsistencyRules(RULES_PATH);
  const goldens = readJsonl(GOLDENS_PATH);

  const fails: string[] = [];

  for (const g of goldens) {
    const flags = computeConsistencyFlags({
      complaintSlug: g.complaintSlug,
      rules,
      anyAnswers: g.anyAnswers ?? {},
      triage: g.triage ?? {},
    });

    const ids = flags.map(f => f.ruleId);

    const hasForceEmerg = flags.some(f => f.action === "FORCE_EMERG");
    const hasNeedsReview = flags.some(f => f.action === "NEEDS_REVIEW" || f.action === "FORCE_EMERG");

    const okFlags = setEq(ids, g.expect.flags ?? []);
    const okForce = hasForceEmerg === !!g.expect.forceEmerg;
    const okReview = hasNeedsReview === !!g.expect.needsReview;

    if (!okFlags || !okForce || !okReview) {
      fails.push(
        `${g.id} FAIL\n` +
        `  expected flags=${JSON.stringify(g.expect.flags)} force=${g.expect.forceEmerg} review=${g.expect.needsReview}\n` +
        `  got      flags=${JSON.stringify(ids)} force=${hasForceEmerg} review=${hasNeedsReview}`
      );
    } else {
      console.log(`  PASS ${g.id} — ${g.complaintSlug} — flags=[${ids.join(",")}]`);
    }
  }

  if (fails.length) {
    console.error(`\nCONSISTENCY GOLDENS FAIL (${fails.length}/${goldens.length})`);
    for (const f of fails.slice(0, 30)) console.error(f);
    process.exit(1);
  }

  console.log(`\nCONSISTENCY GOLDENS PASS (${goldens.length}/${goldens.length})`);
  process.exit(0);
}

main();
