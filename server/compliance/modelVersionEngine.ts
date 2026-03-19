export const MODEL = {
  version: "1.0.0",
  rulesVersion: "rules_v3",
  scoringVersion: "scoring_v2",
  safetyVersion: "safety_v1",
  updatedAt: "2026-03-18",
};

export function attachModelMetadata(result: any): any {
  return {
    ...result,
    _model: {
      version: MODEL.version,
      rulesVersion: MODEL.rulesVersion,
      scoringVersion: MODEL.scoringVersion,
      safetyVersion: MODEL.safetyVersion,
    },
  };
}

export function getModelMetadata() {
  return { ...MODEL };
}
