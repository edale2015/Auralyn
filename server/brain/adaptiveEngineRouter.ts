export interface EngineRoutingContext {
  complaint: string;
  severity?: string;
  redFlagsDetected?: boolean;
  features?: Record<string, any>;
}

export interface EngineRoutingResult {
  engines: string[];
  totalSelected: number;
  routingReason: string;
}

const COMPLAINT_ENGINE_MAP: Record<string, string[]> = {
  cough: ["redFlagEngine", "bayesianDifferentialEngine", "nextQuestionSelector"],
  chest_pain: ["redFlagEngine", "bayesianDifferentialEngine", "clusterScoringEngine", "confidenceCalibrationEngine", "dispositionEngine", "temporalRiskEngine"],
  headache: ["redFlagEngine", "bayesianDifferentialEngine", "temporalRiskEngine", "nextQuestionSelector"],
  dizziness: ["redFlagEngine", "temporalRiskEngine", "bayesianDifferentialEngine", "nextQuestionSelector"],
  sore_throat: ["redFlagEngine", "bayesianDifferentialEngine", "nextQuestionSelector"],
  fever: ["redFlagEngine", "clusterScoringEngine", "bayesianDifferentialEngine", "temporalRiskEngine"],
  ear_pain: ["redFlagEngine", "bayesianDifferentialEngine", "nextQuestionSelector"],
  breathlessness: ["redFlagEngine", "bayesianDifferentialEngine", "temporalRiskEngine", "dispositionEngine", "confidenceCalibrationEngine"],
};

export function selectEngines(context: EngineRoutingContext): EngineRoutingResult {
  const engines = new Set<string>();

  engines.add("clinicalSkillEngine");
  engines.add("protocolSelectionEngine");

  const complaintEngines = COMPLAINT_ENGINE_MAP[context.complaint] ?? ["redFlagEngine", "bayesianDifferentialEngine"];
  complaintEngines.forEach(e => engines.add(e));

  if (context.severity === "high" || context.redFlagsDetected) {
    engines.add("emergencySafetyEngine");
    engines.add("dispositionEngine");
    engines.add("confidenceCalibrationEngine");
  }

  const engineList = Array.from(engines);
  let reason = `Routed ${engineList.length} engines for ${context.complaint}`;
  if (context.severity === "high") reason += " (high severity escalation)";
  if (context.redFlagsDetected) reason += " (red flags detected)";

  return {
    engines: engineList,
    totalSelected: engineList.length,
    routingReason: reason,
  };
}
