import {
  ParsedSymptomPack,
  ParsedModifierPack,
  ParsedClinicianAlgorithm,
  AnswerMap,
  Disposition,
} from "../../shared/packRows";
import { evaluateRules } from "./ruleParser";
import { applyModifierPacks } from "./modifierApplicationEngine";
import { triggerClinicianAlgorithms } from "./clinicianAlgorithmTriggerEngine";

export interface SymptomPackEvaluation {
  packId: string;
  title: string;
  baseDisposition: Disposition;
  matchedRedFlags: string[];
  matchedEscalateRules: string[];
  matchedReviewRules: string[];
  modifierRiskDelta: number;
  forceReview: boolean;
  forceEscalation: boolean;
  finalDisposition: Disposition;
  reasons: string[];
  triggeredAlgorithms: ReturnType<typeof triggerClinicianAlgorithms>;
}

function escalateDisposition(base: Disposition): Disposition {
  const order: Disposition[] = [
    "self_care",
    "office_followup",
    "telemed_now",
    "urgent_care",
    "er_now",
  ];

  const idx = order.indexOf(base);
  if (idx === -1 || idx === order.length - 1) return base;
  return order[idx + 1];
}

export function evaluateSymptomPack(
  pack: ParsedSymptomPack,
  modifierPacks: ParsedModifierPack[],
  clinicianAlgorithms: ParsedClinicianAlgorithm[],
  answers: AnswerMap
): SymptomPackEvaluation {
  const matchedRedFlags = pack.redFlags.filter(flag => {
    const v = answers[flag];
    return v === true || String(v).toLowerCase() === "yes";
  });

  const context = { anyRedFlag: matchedRedFlags.length > 0 };

  const matchedEscalateRules = evaluateRules(pack.autoEscalateRules, answers, context);
  const matchedReviewRules = evaluateRules(pack.autoReviewRules, answers, context);

  const modifierResult = applyModifierPacks(pack, modifierPacks, answers);

  let finalDisposition = pack.likelyDisposition;
  let forceReview = matchedReviewRules.length > 0 || modifierResult.forceReview;
  let forceEscalation =
    matchedEscalateRules.length > 0 || modifierResult.forceEscalation;

  if (forceEscalation) {
    finalDisposition = "er_now";
  } else if (forceReview && finalDisposition === "self_care") {
    finalDisposition = "telemed_now";
  }

  if (modifierResult.riskDelta >= 20 && finalDisposition !== "er_now") {
    finalDisposition = escalateDisposition(finalDisposition);
  }

  const triggeredAlgorithms = triggerClinicianAlgorithms(
    pack,
    clinicianAlgorithms,
    answers
  );

  return {
    packId: pack.id,
    title: pack.title,
    baseDisposition: pack.likelyDisposition,
    matchedRedFlags,
    matchedEscalateRules,
    matchedReviewRules,
    modifierRiskDelta: modifierResult.riskDelta,
    forceReview,
    forceEscalation,
    finalDisposition,
    reasons: [
      ...matchedRedFlags.map(x => `red_flag:${x}`),
      ...matchedEscalateRules.map(x => `escalate_rule:${x}`),
      ...matchedReviewRules.map(x => `review_rule:${x}`),
      ...modifierResult.reasons,
    ],
    triggeredAlgorithms,
  };
}
