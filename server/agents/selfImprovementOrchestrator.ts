import { runSelfImprovementCycle } from "../engines/selfImprovementCycleEngine";

export interface OrchestrationResult {
  cycleResult: any;
  appliedCount: number;
  skippedCount: number;
}

export async function runContinuousImprovement(): Promise<OrchestrationResult> {
  const cycleResult = runSelfImprovementCycle();

  const approvedFixes = (cycleResult.fixes || []).filter(
    (f: any) => f.autoApprove === true
  );

  const skippedFixes = (cycleResult.fixes || []).filter(
    (f: any) => f.autoApprove !== true
  );

  return {
    cycleResult,
    appliedCount: approvedFixes.length,
    skippedCount: skippedFixes.length,
  };
}
