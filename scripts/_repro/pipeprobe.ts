import { executePipeline } from "../../server/clinical/ruleExecutionEngine";

async function run(label: string, inputs: any) {
  const r = await executePipeline("chest_pain", inputs);
  console.log(`\n### ${label}`);
  console.log("  inputs:", JSON.stringify(inputs));
  console.log("  hardStop:", r.hardStop, "| reason:", r.hardStopReason);
  console.log("  finalDisposition:", r.finalDisposition, "| totalRulesFired:", r.totalRulesFired);
  console.log("  criticalFlagsHit:", JSON.stringify(r.criticalFlagsHit));
  // show which red_flag rules fired
  const rf = r.steps.find(s => s.ruleType === "red_flag");
  console.log("  red_flag step: evaluated", rf?.rulesEvaluated, "fired", rf?.rulesFired?.length,
    "->", JSON.stringify(rf?.rulesFired?.slice(0,5).map((x:any)=>({id:x.rule_id, lvl:x.safety_level, logic:x.logic_type}))));
}

(async () => {
  await run("empty", {});
  await run("turn2-onset-only", { /* nothing mapped from 'sudden' */ });
  await run("all-negative (no red flags)", {
    Q_CP_RADIATES: "no", Q_CP_SOB: "no", Q_CP_DIAPHORESIS: "no",
    Q_CP_SYNCOPE: "no", Q_CP_EXERTIONAL: "no", Q_CP_PLEURITIC: "no", Q_CP_FEVER: "no",
  });
  await run("classic-ACS (radiates+sob+diaphoresis)", {
    Q_CP_RADIATES: "yes", Q_CP_SOB: "yes", Q_CP_DIAPHORESIS: "yes",
    Q_CP_SYNCOPE: "no",
  });
  process.exit(0);
})();
