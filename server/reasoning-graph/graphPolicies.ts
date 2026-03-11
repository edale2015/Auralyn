import { SkillContext } from "../skills/shared/skillTypes";
import { getGraphNode } from "./graphNodeRegistry";
import { canSpendMoreLlmCost, shouldPreferCheapRuleFirst } from "../orchestrator/costAwarePolicy";

export function scoreNextSkillCandidate(params: {
  skillName: string;
  context: SkillContext;
  currentCaseEstimatedCostUsd: number;
  basePriority?: number;
}): number {
  const node = getGraphNode(params.skillName);
  let score = params.basePriority ?? 0;

  if (!node) return score;

  if (shouldPreferCheapRuleFirst(params.context)) {
    if (node.engineType === "rules") score += 20;
    if (node.engineType === "hybrid") score += 5;
    if (node.engineType === "llm") score -= 10;
  }

  if (!canSpendMoreLlmCost(params.context, params.currentCaseEstimatedCostUsd)) {
    if (node.engineType === "llm" || node.engineType === "hybrid") score -= 50;
  }

  if (node.safetyClass === "critical") score += 30;
  if (node.category === "safety") score += 15;

  return score;
}
