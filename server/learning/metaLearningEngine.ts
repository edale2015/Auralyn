import { getAgentPerformance } from "./outcomeLearningService";

export interface SystemThresholds {
  escalationThreshold: number;
  uncertaintyThreshold: number;
  requeryThreshold: number;
  safetyBoostFactor: number;
}

let systemThresholds: SystemThresholds = {
  escalationThreshold: 0.70,
  uncertaintyThreshold: 0.55,
  requeryThreshold: 0.60,
  safetyBoostFactor: 1.0,
};

export function runMetaLearning(): SystemThresholds {
  const agents = getAgentPerformance();

  for (const a of agents) {
    if (a.total < 3) continue;

    if (a.undertriage > a.correct * 0.20) {
      systemThresholds.escalationThreshold = Math.max(0.45, systemThresholds.escalationThreshold - 0.03);
      systemThresholds.safetyBoostFactor = Math.min(2.0, systemThresholds.safetyBoostFactor + 0.1);
    }

    if (a.overtriage > a.correct * 0.50) {
      systemThresholds.escalationThreshold = Math.min(0.88, systemThresholds.escalationThreshold + 0.03);
    }

    if (a.incorrect > a.correct * 0.40) {
      systemThresholds.uncertaintyThreshold = Math.max(0.40, systemThresholds.uncertaintyThreshold - 0.02);
      systemThresholds.requeryThreshold = Math.max(0.45, systemThresholds.requeryThreshold - 0.02);
    }
  }

  return { ...systemThresholds };
}

export function getSystemThresholds(): SystemThresholds {
  return { ...systemThresholds };
}
