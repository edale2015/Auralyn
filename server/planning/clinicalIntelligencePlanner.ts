import { detectGraphGaps, GraphGap } from "../knowledge/graphGapDetector";
import { planSimulationSchedule } from "../simulation/simulationPlanner";
import { detectModelDrift } from "../analysis/modelDriftDetector";
import { getOutcomeStats } from "../outcomes/outcomeTracker";

export interface PlanningPriority {
  priority: "critical" | "high" | "medium" | "low";
  task: string;
  description: string;
  count?: number;
  details?: any;
}

export interface PlanningCycleResult {
  priorities: PlanningPriority[];
  nextFocus: string;
  gapCount: number;
  driftDetected: boolean;
  outcomeAccuracy: number | null;
  simulationSchedule: any;
  timestamp: string;
}

export function runClinicalPlanningCycle(): PlanningCycleResult {
  const gaps = detectGraphGaps();
  const drift = detectModelDrift();
  const outcomes = getOutcomeStats();
  const simulationPlan = planSimulationSchedule();

  const priorities: PlanningPriority[] = [];

  const criticalGaps = gaps.filter((g: GraphGap) => g.severity === "critical");
  const highGaps = gaps.filter((g: GraphGap) => g.severity === "high");

  if (criticalGaps.length > 0) {
    priorities.push({
      priority: "critical",
      task: "resolve_critical_graph_gaps",
      description: `${criticalGaps.length} critical knowledge graph gaps require immediate resolution`,
      count: criticalGaps.length,
      details: criticalGaps.slice(0, 5).map((g: GraphGap) => ({
        node: g.nodeLabel,
        problem: g.problem,
        suggestion: g.suggestion,
      })),
    });
  }

  if (drift.drift) {
    priorities.push({
      priority: "critical",
      task: "model_retraining_required",
      description: `Model drift detected: ${drift.trend} trend (magnitude: ${drift.driftMagnitude?.toFixed?.(2) ?? "unknown"})`,
      details: drift,
    });
  }

  if (highGaps.length > 0) {
    priorities.push({
      priority: "high",
      task: "resolve_high_priority_gaps",
      description: `${highGaps.length} high-priority knowledge graph gaps need attention`,
      count: highGaps.length,
      details: highGaps.slice(0, 5).map((g: GraphGap) => ({
        node: g.nodeLabel,
        problem: g.problem,
      })),
    });
  }

  if (outcomes.total > 0 && outcomes.accuracy < 85) {
    priorities.push({
      priority: "high",
      task: "improve_diagnostic_accuracy",
      description: `Diagnostic accuracy at ${outcomes.accuracy}% — below 85% target`,
      details: {
        total: outcomes.total,
        accuracy: outcomes.accuracy,
      },
    });
  }

  if (outcomes.total > 0) {
    priorities.push({
      priority: "medium",
      task: "analyze_outcome_patterns",
      description: `${outcomes.total} outcomes recorded — analyze for systematic biases`,
      count: outcomes.total,
    });
  }

  const moderateGaps = gaps.filter((g: GraphGap) => g.severity === "moderate" || g.severity === "low");
  if (moderateGaps.length > 0) {
    priorities.push({
      priority: "medium",
      task: "resolve_moderate_gaps",
      description: `${moderateGaps.length} moderate/low-priority gaps to address`,
      count: moderateGaps.length,
    });
  }

  priorities.push({
    priority: "medium",
    task: "run_targeted_simulations",
    description: "Execute scheduled simulation plan for coverage and regression testing",
    details: simulationPlan,
  });

  priorities.push({
    priority: "low",
    task: "expand_knowledge_graph",
    description: "Review and expand knowledge graph edges for completeness",
  });

  return {
    priorities,
    nextFocus: priorities.length > 0 ? priorities[0].task : "system_stable",
    gapCount: gaps.length,
    driftDetected: drift.drift ?? false,
    outcomeAccuracy: outcomes.total > 0 ? outcomes.accuracy : null,
    simulationSchedule: simulationPlan,
    timestamp: new Date().toISOString(),
  };
}
