export function metaReasoningEngine(state: {
  entropy?: number;
  tests?: string[];
  differential?: { diagnosis: string; score: number }[];
}): string[] {
  const issues: string[] = [];
  if ((state.entropy ?? 0) > 1) issues.push('high_uncertainty');
  if (!state.tests?.length) issues.push('no_tests_ordered');
  if (!state.differential?.length) issues.push('no_differentials');
  return issues;
}
