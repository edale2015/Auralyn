import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable, toNumber } from "../shared/csvTableLoader";

type NextBestQuestionResult = {
  next_question: string;
  why_it_matters: string;
  impact: number;
  linked_diagnoses: string[];
};

function rowComplaintId(row: CsvRow): string {
  return getFirstValue(row, ["Complaint_ID", "CC_ID", "Complaint", "Chief_Complaint_ID"]);
}

function rowQuestion(row: CsvRow): string {
  return getFirstValue(row, ["Question_Text", "Question", "Prompt"]);
}

export async function selectNextBestQuestion(
  context: SkillContext
): Promise<SkillResult<NextBestQuestionResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "select_next_best_question");

  const bundle =
    context.priorSkillOutputs?.run_complaint_question_bundle?.result ??
    context.priorSkillOutputs?.runComplaintQuestionBundle?.result ??
    {};

  const pending_questions: string[] = Array.isArray(bundle.pending_questions)
    ? bundle.pending_questions
    : [];

  let impactRows: CsvRow[] = [];
  try {
    impactRows = await loadCsvTable("QUESTION_IMPACT.csv");
  } catch {
    impactRows = [];
  }

  let bestQuestion = pending_questions[0] ?? "";
  let bestImpact = 1;
  let why = "Next unanswered complaint-specific question";
  let linkedDiagnoses: string[] = [];

  if (impactRows.length > 0 && pending_questions.length > 0) {
    for (const q of pending_questions) {
      const row = impactRows.find((r) => {
        const cid = rowComplaintId(r).toLowerCase();
        const rq = rowQuestion(r).toLowerCase();
        return (
          cid === context.complaintId!.toLowerCase() &&
          rq === q.toLowerCase()
        );
      });

      if (!row) continue;

      const impact = toNumber(
        getFirstValue(row, ["Impact", "Impact_Score", "Weight"]),
        1
      );
      if (impact > bestImpact) {
        bestImpact = impact;
        bestQuestion = q;
        why =
          getFirstValue(row, ["Why_It_Matters", "Rationale", "Reason"]) ||
          "High diagnostic/disposition impact";
        linkedDiagnoses = getFirstValue(row, ["Linked_Diagnoses", "Diagnoses", "Targets"])
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  }

  const result: SkillResult<NextBestQuestionResult> = {
    skillId: "SK008",
    skillName: "select_next_best_question",
    version: "v1",
    status: bestQuestion ? "success" : "partial",
    confidence: bestQuestion ? 0.91 : 0.4,
    result: {
      next_question: bestQuestion,
      why_it_matters: why,
      impact: bestImpact,
      linked_diagnoses: linkedDiagnoses,
    },
    audit: {
      tablesUsed: impactRows.length ? ["QUESTION_IMPACT"] : ["QUESTION_IMPACT_FALLBACK"],
      ruleHits: bestQuestion ? [`NBQ_${context.complaintId}`] : [],
      missingData: bestQuestion ? [] : ["no_pending_question_available"],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: bestQuestion ? ["select_next_best_question"] : ["determine_disposition"],
  };

  assertSkillResultShape(result, "select_next_best_question");
  return result;
}
