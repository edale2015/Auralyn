import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

type MeasureWorkflowValueResult = {
  minutes_saved_estimate: number;
  questions_precollected: number;
  note_sections_prefilled: number;
};

function countArray(value: any): number {
  return Array.isArray(value) ? value.length : 0;
}

export async function measureWorkflowValue(
  context: SkillContext
): Promise<SkillResult<MeasureWorkflowValueResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const questionBundle =
    context.priorSkillOutputs?.run_complaint_question_bundle?.result ?? {};
  const globalBundles =
    context.priorSkillOutputs?.trigger_global_secondary_questions?.result ?? {};
  const normalized =
    context.priorSkillOutputs?.normalize_patient_story?.result ?? {};
  const assessmentPlan =
    context.priorSkillOutputs?.generate_assessment_plan?.result ?? {};
  const reviewPacket =
    context.priorSkillOutputs?.generate_physician_review_packet?.result ?? {};

  const askedQuestions = countArray(questionBundle.asked_questions);
  const pendingQuestions = countArray(questionBundle.pending_questions);
  const globalQuestions = countArray(
    globalBundles.triggered_question_bundles?.flatMap?.((b: any) => b.questions) ?? []
  );
  const questions_precollected = askedQuestions + pendingQuestions + globalQuestions;

  let note_sections_prefilled = 0;
  if (normalized.structured_facts) note_sections_prefilled += 1;
  if (assessmentPlan.assessment) note_sections_prefilled += 1;
  if (assessmentPlan.plan) note_sections_prefilled += 1;
  if (reviewPacket.complaintSummary) note_sections_prefilled += 1;
  if (reviewPacket.likelyDiagnoses) note_sections_prefilled += 1;

  const minutes_saved_estimate =
    Math.round((questions_precollected * 0.25 + note_sections_prefilled * 0.75) * 10) / 10;

  const result: SkillResult<MeasureWorkflowValueResult> = {
    skillId: "SK017",
    skillName: "measure_workflow_value",
    version: "v1",
    status: "success",
    confidence: 0.86,
    result: {
      minutes_saved_estimate,
      questions_precollected,
      note_sections_prefilled,
    },
    audit: {
      tablesUsed: ["WORKFLOW_METRICS_FALLBACK"],
      ruleHits: ["WORKFLOW_VALUE_ESTIMATED"],
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: [],
  };

  assertSkillResultShape(result, "measure_workflow_value");
  return result;
}
