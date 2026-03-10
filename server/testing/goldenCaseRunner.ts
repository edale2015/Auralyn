import * as fs from "fs/promises";
import * as path from "path";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { compareGoldenCase } from "./goldenCaseComparator";
import { SkillContext } from "../skills/shared/skillTypes";

type GoldenCase = {
  id: string;
  input: {
    rawText: string;
    modifiers?: Record<string, any>;
  };
  expected: Record<string, any>;
};

function extractActualResult(state: any) {
  return {
    complaint_id:
      state.skillResults?.identify_chief_complaint?.result?.complaint_id ?? "",
    disposition:
      state.skillResults?.determine_disposition?.result?.disposition ?? "",
    clinical_score_name:
      state.skillResults?.apply_clinical_score?.result?.score_name ?? "",
    clinical_score_value:
      state.skillResults?.apply_clinical_score?.result?.score_value ?? null,
    red_flag_hits:
      (state.skillResults?.detect_red_flags?.result?.red_flag_hits ?? []).map(
        (r: any) => r.label ?? r.id ?? String(r)
      ),
    top_differential:
      (state.skillResults?.generate_differential?.result?.differential_list ?? [])
        .slice(0, 3)
        .map((d: any) => d.diagnosis ?? String(d)),
    affirmed_symptoms:
      state.skillResults?.normalize_patient_story?.result?.associated_symptoms ?? [],
    negated_symptoms:
      state.skillResults?.normalize_patient_story?.result?.negated_symptoms ?? [],
  };
}

async function loadGoldenCases(fileName: string): Promise<GoldenCase[]> {
  const fullPath = path.resolve(process.cwd(), "server/testing", fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw) as GoldenCase[];
}

export async function runGoldenCases(fileName = "goldenCases.sample.json") {
  const cases = await loadGoldenCases(fileName);
  const orchestrator = new ClinicalSkillOrchestrator();

  let passed = 0;
  let failed = 0;

  for (const testCase of cases) {
    const context: SkillContext = {
      caseId: `GOLDEN_${testCase.id}`,
      rawText: testCase.input.rawText,
      modifiers: testCase.input.modifiers ?? {},
      knownFacts: {},
      priorSkillOutputs: {},
      config: {
        strictMode: true,
        enableAudit: true,
      },
    };

    const state = await orchestrator.run(context);
    const actual = extractActualResult(state);
    const comparison = compareGoldenCase({
      actual,
      expected: testCase.expected,
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

  console.log(`\nGolden case results: ${passed} passed, ${failed} failed, total ${cases.length}`);
  return { passed, failed, total: cases.length };
}

const isMainModule = typeof process !== "undefined" && process.argv[1]?.includes("goldenCaseRunner");
if (isMainModule) {
  runGoldenCases().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
