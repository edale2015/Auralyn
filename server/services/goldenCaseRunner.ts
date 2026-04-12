import { goldenCaseService } from "./goldenCaseService";
import { runClinicalWorkflow } from "../workflows/clinicalWorkflowEngine";

export interface GoldenCaseSuiteResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: Awaited<ReturnType<typeof goldenCaseService.listRuns>>;
}

export async function runAllGoldenCases(): Promise<GoldenCaseSuiteResult> {
  const cases   = goldenCaseService.list();
  const results = [];

  for (const caseDef of cases) {
    const actual = await runClinicalWorkflow(caseDef.input);
    const result = goldenCaseService.compare(caseDef, actual, actual.traceId);
    results.push(result);
  }

  return {
    total:   results.length,
    passed:  results.filter((r) => r.passed).length,
    failed:  results.filter((r) => !r.passed).length,
    results: goldenCaseService.listRuns(),
  };
}
