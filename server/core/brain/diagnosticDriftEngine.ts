import { BrainCaseInput, DriftResult, RankedItem } from '../../../shared/brainEngineTypes';

export function runDiagnosticDriftEngine(
  input: BrainCaseInput,
  current: RankedItem[]
): DriftResult {
  const prev = input.priorSnapshots?.slice(-1)[0];
  const currentTop = current[0];
  const summary: string[] = [];
  let majorDrift = false;
  if (
    prev?.topDiagnosis &&
    currentTop &&
    prev.topDiagnosis !== currentTop.id &&
    Math.abs((prev.topScore || 0) - currentTop.score) >= 0.25
  ) {
    majorDrift = true;
    summary.push(`Top diagnosis changed from ${prev.topDiagnosis} to ${currentTop.id}.`);
  }
  return { majorDrift, summary };
}
