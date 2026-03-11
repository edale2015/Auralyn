import * as fs from "fs/promises";
import * as path from "path";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { SkillContext } from "../skills/shared/skillTypes";
import { compareGraphGoldenCase } from "./graphGoldenCaseComparator";

type GoldenCase = {
  id: string;
  input: {
    rawText: string;
    modifiers?: Record<string, any>;
  };
  expected?: Record<string, any>;
};

async function loadGoldenCases(fileName: string): Promise<GoldenCase[]> {
  const fullPath = path.resolve(process.cwd(), "server/testing", fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw) as GoldenCase[];
}

function extractGraphActual(state: any) {
  const totalEstimatedCostUsd = Object.values(state.skillResults ?? {}).reduce(
    (sum: number, r: any) => sum + Number(r?.audit?.estimatedCostUsd ?? 0),
    0
  );

  return {
    completed_skills: state.completedSkills ?? [],
    stop_reason: state.finalDisposition
      ? `Disposition reached: ${state.finalDisposition}`
      : "No further graph edges or sequence complete",
    total_estimated_cost_usd: totalEstimatedCostUsd,
  };
}

export async function runGraphGoldenCases(
  fileName = "goldenCases.sample.json"
) {
  const cases = await loadGoldenCases(fileName);
  const orchestrator = new ClinicalSkillOrchestrator();

  let passed = 0;
  let failed = 0;

  for (const testCase of cases) {
    const context: SkillContext = {
      caseId: `GRAPH_GOLDEN_${testCase.id}`,
      rawText: testCase.input.rawText,
      modifiers: testCase.input.modifiers ?? {},
      knownFacts: {},
      priorSkillOutputs: {},
      config: {
        strictMode: true,
        enableAudit: true,
        orchestrationMode: "graph" as any,
      },
    };

    const state = await orchestrator.run(context);
    const actual = extractGraphActual(state);
    const comparison = compareGraphGoldenCase({
      actual,
      expected: testCase.expected ?? {},
    });

    if (comparison.passed) {
      passed += 1;
      console.log(`PASS ${testCase.id}`);
    } else {
      failed += 1;
      console.log(`FAIL ${testCase.id}`);
      for (const failure of comparison.failures) {
        console.log(`  - ${failure}`);
      }
      console.log(`  actual: ${JSON.stringify(actual, null, 2)}`);
    }
  }

  console.log(
    `\nGraph golden case results: ${passed} passed, ${failed} failed, total ${cases.length}`
  );
  return { passed, failed, total: cases.length };
}

runGraphGoldenCases().catch((err) => {
  console.error(err);
  process.exit(1);
});
