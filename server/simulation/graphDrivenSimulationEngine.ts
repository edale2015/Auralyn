import { detectGraphGaps } from "../knowledge/graphGapDetector";
import { generateGapTargetCase, GapTargetCase } from "./gapTargetCaseFactory";
import { prioritizeSimulationTargets } from "./simulationPriorityPlanner";
import { GraphGap } from "../knowledge/graphGapDetector";

export interface GraphSimulationResult {
  gap: GraphGap;
  simCase: GapTargetCase;
  status: string;
  recommendation: string;
}

export function runGraphDrivenSimulation(maxTargets = 20): {
  timestamp: string;
  totalGaps: number;
  simulatedCount: number;
  results: GraphSimulationResult[];
  summary: Record<string, number>;
} {
  const gaps = detectGraphGaps();
  const prioritized = prioritizeSimulationTargets(gaps);
  const targets = prioritized.slice(0, maxTargets);

  const results: GraphSimulationResult[] = targets.map(gap => {
    const simCase = generateGapTargetCase(gap);

    let recommendation = "";
    if (gap.problem === "missing_protocol") {
      recommendation = `Add clinical protocol for ${gap.nodeLabel} and re-run simulation`;
    } else if (gap.problem === "no_engine_assigned") {
      recommendation = `Assign engine to skill "${gap.nodeLabel}" to enable automated reasoning`;
    } else if (gap.problem === "no_disposition_path") {
      recommendation = `Map disposition pathway for diagnosis "${gap.nodeLabel}"`;
    } else if (gap.problem === "missing_skill_mapping") {
      recommendation = `Map required clinical skills for "${gap.nodeLabel}"`;
    } else if (gap.problem === "no_questions_mapped") {
      recommendation = `Add screening questions for "${gap.nodeLabel}"`;
    } else if (gap.problem === "no_diagnoses_linked") {
      recommendation = `Link differential diagnoses to "${gap.nodeLabel}"`;
    } else {
      recommendation = `Review and resolve gap in "${gap.nodeLabel}"`;
    }

    return {
      gap,
      simCase,
      status: "simulated",
      recommendation,
    };
  });

  const summary: Record<string, number> = {};
  results.forEach(r => {
    summary[r.gap.problem] = (summary[r.gap.problem] ?? 0) + 1;
  });

  return {
    timestamp: new Date().toISOString(),
    totalGaps: gaps.length,
    simulatedCount: results.length,
    results,
    summary,
  };
}
