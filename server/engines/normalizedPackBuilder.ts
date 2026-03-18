import {
  ParsedSymptomPack,
  SymptomPackRow,
  IntakeQuestion,
} from "../../shared/packRows";
import { PackQuestionRow } from "../../shared/packQuestionRows";

function safeParseOptions(raw?: string) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function buildParsedSymptomPacksFromRows(
  symptomRows: SymptomPackRow[],
  questionRows: PackQuestionRow[]
): ParsedSymptomPack[] {
  return symptomRows
    .filter(row => row.isActive)
    .map(row => {
      const normalizedQuestions: IntakeQuestion[] = questionRows
        .filter(q => q.packId === row.id && q.isActive)
        .map(q => ({
          id: q.questionId,
          prompt: q.prompt,
          type: q.type,
          priority: q.priority,
          required: q.required,
          options: safeParseOptions(q.optionsJson),
          helpText: q.helpText,
        }))
        .sort((a, b) => a.priority - b.priority);

      const hasNormalizedQuestions = normalizedQuestions.length > 0;

      let questions: IntakeQuestion[];
      if (hasNormalizedQuestions) {
        questions = normalizedQuestions;
      } else {
        try {
          questions = JSON.parse(row.questionsJson);
        } catch {
          questions = [];
        }
      }

      return {
        id: row.id,
        system: row.system,
        title: row.title,
        aliases: row.aliases,
        likelyDisposition: row.likelyDisposition,
        questions,
        redFlags: row.redFlags,
        autoEscalateRules: row.autoEscalateRules,
        autoReviewRules: row.autoReviewRules,
        planTemplateKey: row.planTemplateKey,
        tags: row.tags,
      };
    });
}
