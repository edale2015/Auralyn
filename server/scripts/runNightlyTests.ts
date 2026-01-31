import { FLOW_SPECS } from "../testing/specs";
import { generateScenariosForFlow } from "../testing/generator";
import { executeScenario } from "../testing/executor";
import { expectedFromRules, scoreRun } from "../testing/evaluator";
import { writeRun } from "../testing/sinks";
import { TestRunRecord } from "../testing/types";

async function main() {
  const PER_FLOW = Number(process.env.TESTS_PER_FLOW || 25);

  console.log(`Nightly tests starting. PER_FLOW=${PER_FLOW} flows=${FLOW_SPECS.length}`);

  let total = 0;
  let fails = 0;

  for (const spec of FLOW_SPECS) {
    let scenarios;
    try {
      scenarios = await generateScenariosForFlow(spec, PER_FLOW);
    } catch (e: any) {
      console.warn(`Skipping flow ${spec.flowId}: ${e?.message || e}`);
      continue;
    }

    for (const s of scenarios) {
      total++;

      let out;
      try {
        out = await executeScenario(s);
      } catch (e: any) {
        fails++;
        const record: TestRunRecord = {
          runId: s.runId,
          ts: s.ts,
          system: s.system,
          flowId: s.flowId,
          chiefComplaint: s.chiefComplaint,
          routerText: s.routerText,
          answers: s.answers,
          modifiers: s.modifiers,
          expected: { expectedDisposition: "routine_or_supportive", reasons: ["EXECUTION_ERROR"] },
          output: { disposition: "ERROR", redFlag: false, raw: { error: e?.message || String(e) } },
          score: { pass: false, severity: 20, issues: [{ code: "EXECUTION_ERROR", message: e?.message || String(e) }] },
          tags: s.tags,
        };
        await writeRun(record);
        continue;
      }

      const expected = expectedFromRules(spec, s);
      const score = scoreRun(expected, out);

      if (!score.pass) fails++;

      const record: TestRunRecord = {
        runId: s.runId,
        ts: s.ts,
        system: s.system,
        flowId: s.flowId,
        chiefComplaint: s.chiefComplaint,
        routerText: s.routerText,
        answers: s.answers,
        modifiers: s.modifiers,
        expected,
        output: out,
        score,
        tags: s.tags,
      };

      await writeRun(record);
    }

    console.log(`Done flow ${spec.flowId}: ran ${scenarios.length}`);
  }

  console.log(`Nightly tests complete. total=${total} fails=${fails}`);
}

main().catch((e) => {
  console.error("runNightlyTests failed:", e);
  process.exit(1);
});
