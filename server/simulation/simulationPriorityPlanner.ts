import { GraphGap } from "../knowledge/graphGapDetector";

const PROBLEM_WEIGHTS: Record<string, number> = {
  no_engine_assigned: 5,
  missing_protocol: 4,
  no_disposition_path: 3,
  missing_skill_mapping: 2,
  no_questions_mapped: 1,
  no_diagnoses_linked: 1,
};

export function prioritizeSimulationTargets(gaps: GraphGap[]): GraphGap[] {
  return [...gaps].sort((a, b) => {
    const wA = PROBLEM_WEIGHTS[a.problem] ?? 0;
    const wB = PROBLEM_WEIGHTS[b.problem] ?? 0;
    if (wB !== wA) return wB - wA;
    const sevOrder: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
    return (sevOrder[b.severity] ?? 0) - (sevOrder[a.severity] ?? 0);
  });
}

export function getSimulationPlan(gaps: GraphGap[], maxTargets = 20) {
  const prioritized = prioritizeSimulationTargets(gaps);
  const targets = prioritized.slice(0, maxTargets);
  const bySeverity: Record<string, number> = {};
  const byProblem: Record<string, number> = {};
  targets.forEach(g => {
    bySeverity[g.severity] = (bySeverity[g.severity] ?? 0) + 1;
    byProblem[g.problem] = (byProblem[g.problem] ?? 0) + 1;
  });
  return {
    totalGaps: gaps.length,
    targetCount: targets.length,
    bySeverity,
    byProblem,
    targets,
  };
}
