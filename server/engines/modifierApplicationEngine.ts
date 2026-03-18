import {
  ParsedModifierPack,
  ParsedSymptomPack,
  AnswerMap,
} from "../../shared/packRows";
import { evaluateRule, evaluateRules } from "./ruleParser";

export interface ModifierApplicationResult {
  matchedModifiers: Array<{
    modifierId: string;
    title: string;
    matchedTriggers: string[];
  }>;
  riskDelta: number;
  forceReview: boolean;
  forceEscalation: boolean;
  reasons: string[];
}

export function applyModifierPacks(
  symptomPack: ParsedSymptomPack,
  modifierPacks: ParsedModifierPack[],
  answers: AnswerMap
): ModifierApplicationResult {
  const result: ModifierApplicationResult = {
    matchedModifiers: [],
    riskDelta: 0,
    forceReview: false,
    forceEscalation: false,
    reasons: [],
  };

  for (const mod of modifierPacks) {
    if (!mod.appliesToSymptoms.includes(symptomPack.id)) continue;

    const matchedTriggers = evaluateRules(mod.triggers, answers);
    if (matchedTriggers.length === 0) continue;

    result.matchedModifiers.push({
      modifierId: mod.id,
      title: mod.title,
      matchedTriggers,
    });

    for (const adj of mod.riskAdjustments) {
      if (!evaluateRule(adj.condition, answers)) continue;

      if (adj.action === "raise_risk") {
        result.riskDelta += adj.amount || 0;
      } else if (adj.action === "force_review") {
        result.forceReview = true;
      } else if (adj.action === "force_escalation") {
        result.forceEscalation = true;
      }

      result.reasons.push(`${mod.id}:${adj.reason}`);
    }
  }

  return result;
}
