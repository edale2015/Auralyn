import * as fs from "fs/promises";
import * as path from "path";
import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";
import { CsvRow, getFirstValue, loadCsvTable, toNumber } from "../shared/csvTableLoader";
import { buildReasoningSummary } from "../shared/reasoningSummaryHelper";
import { attachCostMetadata } from "../shared/skillCostTracker";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadQuestionRanking(): Promise<Record<string, number>> {
  try {
    const filePath = path.join(RUNTIME_DIR, "question_reprioritization.json");
    const raw = await fs.readFile(filePath, "utf8");
    const rows = JSON.parse(raw) as Array<{ question: string; netValue: number }>;
    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.question.toLowerCase()] = row.netValue;
    }
    return map;
  } catch {
    return {};
  }
}

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
  let learnedBoostApplied = false;

  const learnedRanking = await loadQuestionRanking();

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

      const impact = toNumber(getFirstValue(row, ["Impact", "Impact_Score", "Weight"]), 1);
      const learnedBoost = learnedRanking[q.toLowerCase()] ?? 0;
      const totalImpact = impact + learnedBoost;

      if (totalImpact > bestImpact) {
        bestImpact = totalImpact;
        bestQuestion = q;
        why =
          getFirstValue(row, ["Why_It_Matters", "Rationale", "Reason"]) ||
          "High diagnostic/disposition impact";
        linkedDiagnoses = getFirstValue(row, ["Linked_Diagnoses", "Diagnoses", "Targets"])
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        if (learnedBoost !== 0) learnedBoostApplied = true;
      }
    }
  }

  const confidence = bestQuestion ? 0.91 : 0.4;

  let result: SkillResult<NextBestQuestionResult> = {
    skillId: "SK008",
    skillName: "select_next_best_question",
    version: "v1",
    status: bestQuestion ? "success" : "partial",
    confidence,
    reasoning_summary: buildReasoningSummary({
      skillName: "select_next_best_question",
      headline: bestQuestion
        ? `Selected: "${bestQuestion.slice(0, 60)}"${learnedBoostApplied ? " (outcome-boosted)" : ""}. Impact: ${bestImpact.toFixed(1)}.`
        : "No pending questions available — routing to disposition.",
      matchedRules: bestQuestion ? [`NBQ_${context.complaintId}`] : [],
      missingData: bestQuestion ? [] : ["no_pending_question_available"],
      confidence,
    }),
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

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: context.complaintId,
  });

  assertSkillResultShape(result, "select_next_best_question");
  return result;
}
