export interface SimulationSchedule {
  daily: string[];
  weekly: string[];
  monthly: string[];
}

export function planSimulationSchedule(): SimulationSchedule {
  return {
    daily: [
      "graph_gap_simulations",
      "red_flag_stress_test",
    ],
    weekly: [
      "rare_disease_cases",
      "protocol_edge_cases",
      "question_coverage_validation",
    ],
    monthly: [
      "full_platform_simulation",
      "cost_performance_analysis",
      "cross_complaint_regression",
    ],
  };
}
