import { SkillContext, SkillResult } from "../shared/skillTypes";
import { buildReasoningSummary } from "../shared/reasoningSummaryHelper";
import { attachCostMetadata } from "../shared/skillCostTracker";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable } from "../shared/csvTableLoader";

type QuestionBundleResult = {
  pending_questions: string[];
  asked_questions: string[];
  skipped_questions: string[];
  rule_triggers: string[];
};

function rowComplaintId(row: CsvRow): string {
  return getFirstValue(row, ["Complaint_ID", "CC_ID", "Complaint", "Chief_Complaint_ID"]);
}

function rowQuestion(row: CsvRow): string {
  return getFirstValue(row, ["Question_Text", "Question", "Prompt"]);
}

function rowQuestionId(row: CsvRow): string {
  return getFirstValue(row, ["Question_ID", "ID", "Q_ID"]);
}

async function loadQuestionRows(): Promise<CsvRow[]> {
  try {
    return await loadCsvTable("SECONDARY_QUESTIONS.csv");
  } catch {
    try {
      return await loadCsvTable("CORE_QUESTIONS.csv");
    } catch {
      return [];
    }
  }
}

export async function runComplaintQuestionBundle(
  context: SkillContext
): Promise<SkillResult<QuestionBundleResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "run_complaint_question_bundle");

  const rows = await loadQuestionRows();
  const knownBlob = JSON.stringify({
    knownFacts: context.knownFacts ?? {},
    priorSkillOutputs: context.priorSkillOutputs ?? {},
    modifiers: context.modifiers ?? {},
  }).toLowerCase();

  const matching = rows.filter((row) => {
    const cid = rowComplaintId(row).toLowerCase();
    return cid === context.complaintId!.toLowerCase();
  });

  const pending_questions: string[] = [];
  const asked_questions: string[] = [];
  const skipped_questions: string[] = [];
  const rule_triggers: string[] = [];

  for (const row of matching) {
    const q = rowQuestion(row);
    const qid = rowQuestionId(row) || `Q_${q.slice(0, 20)}`;
    if (!q) continue;

    const normalizedQuestion = q.toLowerCase();
    const alreadyKnown = knownBlob.includes(normalizedQuestion);

    if (alreadyKnown) {
      asked_questions.push(q);
      skipped_questions.push(q);
      continue;
    }

    pending_questions.push(q);
    rule_triggers.push(qid);
  }

  const tableUsed = rows.length > 0 ? "SECONDARY_QUESTIONS" : "CORE_QUESTIONS";

  let result: SkillResult<QuestionBundleResult> = {
    skillId: "SK009",
    skillName: "run_complaint_question_bundle",
    version: "v1",
    status: "success",
    confidence: 0.95,
    reasoning_summary: buildReasoningSummary({
      skillName: "run_complaint_question_bundle",
      headline: `Built question bundle: ${pending_questions.length} pending, ${skipped_questions.length} already answered.`,
      matchedRules: rule_triggers.slice(0, 5),
      missingData: pending_questions.length === 0 ? ["no_pending_questions_found"] : [],
      confidence: 0.95,
    }),
    result: { pending_questions, asked_questions, skipped_questions, rule_triggers },
    audit: {
      tablesUsed: [tableUsed],
      ruleHits: rule_triggers,
      missingData: pending_questions.length === 0 ? ["no_pending_questions_found"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["select_next_best_question"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: context.complaintId,
  });

  assertSkillResultShape(result, "run_complaint_question_bundle");
  return result;
}
