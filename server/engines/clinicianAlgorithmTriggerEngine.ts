import {
  ParsedClinicianAlgorithm,
  ParsedSymptomPack,
  AnswerMap,
} from "../../shared/packRows";
import { evaluateRule } from "./ruleParser";

export interface TriggeredClinicianAlgorithm {
  id: string;
  title: string;
  requiredInputs: string[];
  outputActions: string[];
  notes?: string[];
  matchedEntryCriteria: string[];
}

export function triggerClinicianAlgorithms(
  symptomPack: ParsedSymptomPack,
  algorithms: ParsedClinicianAlgorithm[],
  answers: AnswerMap
): TriggeredClinicianAlgorithm[] {
  const relevant = algorithms.filter(a => a.system === symptomPack.system);

  const triggered: TriggeredClinicianAlgorithm[] = [];

  for (const algo of relevant) {
    const matched = algo.entryCriteria.filter(rule => evaluateRule(rule, answers));
    if (matched.length === 0) continue;

    triggered.push({
      id: algo.id,
      title: algo.title,
      requiredInputs: algo.requiredInputs,
      outputActions: algo.outputActions,
      notes: algo.notes,
      matchedEntryCriteria: matched,
    });
  }

  return triggered;
}
