import { SkillContext } from "../skills/shared/skillTypes";

export function buildAuditTrace(context: SkillContext) {
  const outputs = context.priorSkillOutputs ?? {};

  return Object.entries(outputs).map(([skillName, result]: any) => ({
    skillName,
    status: result?.status ?? "unknown",
    confidence: result?.confidence ?? null,
    ruleHits: result?.audit?.ruleHits ?? [],
    missingData: result?.audit?.missingData ?? [],
    nextRecommendedSkills: result?.nextRecommendedSkills ?? [],
  }));
}
