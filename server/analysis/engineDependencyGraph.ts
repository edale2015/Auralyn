export interface EngineDependency {
  engine: string;
  engineId: string;
  dependsOn: string[];
  dependsOnIds: string[];
  level: string;
}

export const engineDependencies: Record<string, string[]> = {
  nextQuestionSelector: ["skillEngine", "protocolSelectionEngine"],
  bayesianDifferentialEngine: ["caseSimilarityEngine", "symptomWeightingEngine"],
  dispositionEngine: ["bayesianDifferentialEngine", "redFlagEngine", "confidenceCalibrationEngine"],
  toneStrategyEngine: ["anxietyDetectionEngine"],
  protocolSelectionEngine: ["clinicalSkillEngine"],
  confidenceCalibrationEngine: ["bayesianDifferentialEngine"],
  clusterScoringEngine: ["caseSimilarityEngine"],
  consensusEngine: ["bayesianDifferentialEngine", "redFlagEngine", "clusterScoringEngine"],
};

function toGraphId(name: string): string {
  return name.startsWith("engine:") ? name : `engine:${name}`;
}

export function getEngineDependencyList(): EngineDependency[] {
  return Object.entries(engineDependencies).map(([engine, dependsOn]) => ({
    engine,
    engineId: toGraphId(engine),
    dependsOn,
    dependsOnIds: dependsOn.map(toGraphId),
    level: dependsOn.length === 0 ? "leaf" : dependsOn.length <= 2 ? "mid" : "root",
  }));
}

export function getUpstreamDependencies(engineName: string): string[] {
  const key = engineName.replace(/^engine:/, "");
  return (engineDependencies[key] ?? []).map(toGraphId);
}

export function getDownstreamDependents(engineName: string): string[] {
  const key = engineName.replace(/^engine:/, "");
  return Object.entries(engineDependencies)
    .filter(([_, deps]) => deps.includes(key))
    .map(([engine]) => toGraphId(engine));
}
