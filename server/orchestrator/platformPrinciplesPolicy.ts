import { OrchestratorState, PlatformPrinciplesCheck } from "../skills/shared/skillTypes";

const HIGH_VALUE_COMPLAINTS = new Set([
  "cough",
  "sore_throat",
  "fever",
  "sinus_pressure",
  "ear_pain",
  "uti",
  "abdominal_pain",
  "chest_pain",
  "rash",
  "injury",
]);

export function evaluatePlatformPrinciples(state: OrchestratorState): PlatformPrinciplesCheck {
  const results = state.skillResults;
  const completed = new Set(state.completedSkills);

  const decisionDataCaptured =
    Object.keys(results).length > 0 &&
    Object.values(results).every((r) => !!r.audit && !!r.result);

  const infrastructureReusable = true;

  const outcomeAttachPoint = completed.has("attach_outcome_stub");

  const workflowEmbedded =
    completed.has("determine_disposition") &&
    completed.has("generate_assessment_plan") &&
    completed.has("generate_physician_review_packet");

  const networkEffectReady =
    decisionDataCaptured &&
    completed.has("measure_workflow_value") &&
    outcomeAttachPoint;

  const physicianTimeSaved =
    completed.has("measure_workflow_value") ||
    completed.has("collect_modifiers") ||
    completed.has("generate_physician_review_packet");

  const regulatorySafe =
    completed.has("detect_red_flags") &&
    completed.has("determine_disposition") &&
    completed.has("generate_physician_review_packet");

  const highValueComplaint =
    !!state.context.complaintId && HIGH_VALUE_COMPLAINTS.has(state.context.complaintId);

  const productModuleAssigned = Object.keys(results).length > 0;

  const expertPathwayPreserved =
    completed.has("run_complaint_question_bundle") ||
    completed.has("score_differential_clusters") ||
    completed.has("apply_clinical_score");

  const strategicNotes: string[] = [];

  if (!outcomeAttachPoint) strategicNotes.push("Outcome tracking stub missing");
  if (!workflowEmbedded) strategicNotes.push("Workflow outputs incomplete");
  if (!regulatorySafe) strategicNotes.push("Regulatory review layer incomplete");
  if (!expertPathwayPreserved) strategicNotes.push("Structured expert pathway not sufficiently preserved");

  return {
    decisionDataCaptured,
    infrastructureReusable,
    outcomeAttachPoint,
    workflowEmbedded,
    networkEffectReady,
    physicianTimeSaved,
    regulatorySafe,
    highValueComplaint,
    productModuleAssigned,
    expertPathwayPreserved,
    strategicNotes,
  };
}
