import { SkillContext } from "../skills/shared/skillTypes";

export function shouldPreferCheapRuleFirst(context: SkillContext): boolean {
  return context.config?.cheapRuleFirst !== false;
}

export function canSpendMoreLlmCost(
  context: SkillContext,
  currentCaseEstimatedCostUsd: number
): boolean {
  const max = context.config?.maxLlmCostUsdPerCase ?? 0.03;
  return currentCaseEstimatedCostUsd < max;
}
