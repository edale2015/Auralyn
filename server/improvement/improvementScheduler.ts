import { detectWeakAreas } from "./weaknessDetector";
import { generateImprovements } from "./improvementGenerator";
import { saveImprovement } from "./improvementStore";

export function runImprovementCycle(simulationSummary: any, source = "manual") {
  const weaknesses = detectWeakAreas(simulationSummary);
  const improvements = generateImprovements(weaknesses);

  saveImprovement({
    timestamp: Date.now(),
    weaknesses,
    improvements,
    source,
    appliedCount: 0,
  });

  return { weaknesses, improvements };
}
