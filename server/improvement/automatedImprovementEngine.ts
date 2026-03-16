import { runImprovementCycle } from "./improvementScheduler";
import { getLastRunSummary } from "../simulation/simulationStore";

export class AutomatedClinicalImprovementEngine {
  run(summary?: any) {
    const src = summary ?? getLastRunSummary();

    if (!src) {
      return {
        improvements: [],
        weaknesses: [],
        note: "No simulation data available — run a simulation first",
      };
    }

    const result = runImprovementCycle(src, "automated");
    return result;
  }

  runFromSummary(summary: any) {
    return runImprovementCycle(summary, "on_demand");
  }
}

export const acie = new AutomatedClinicalImprovementEngine();
