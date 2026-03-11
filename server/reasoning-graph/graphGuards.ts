import { SkillContext } from "../skills/shared/skillTypes";
import { canonicalizeComplaintId } from "../skills/shared/complaintAliasRegistry";

export function hasComplaint(context: SkillContext): boolean {
  return Boolean(context.complaintId);
}

export function isComplaintIn(
  context: SkillContext,
  complaintIds: string[]
): boolean {
  const current = canonicalizeComplaintId(context.complaintId);
  return complaintIds.map(canonicalizeComplaintId).includes(current);
}

export function hasStructuredFacts(context: SkillContext): boolean {
  return Boolean(context.knownFacts && Object.keys(context.knownFacts).length);
}

export function hasRedFlagSeverity(context: SkillContext): boolean {
  return Boolean(
    context.priorSkillOutputs?.detect_red_flags?.result?.severity
  );
}

export function isUrgentOrErDisposition(context: SkillContext): boolean {
  const d = context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "";
  return ["urgent_same_day", "er_now"].includes(d);
}

export function needsFormalScore(context: SkillContext): boolean {
  const complaint = canonicalizeComplaintId(context.complaintId);
  return ["sore_throat", "cough", "chest_pain"].includes(complaint);
}

export function needsMoreQuestions(context: SkillContext): boolean {
  const pending =
    context.priorSkillOutputs?.run_complaint_question_bundle?.result?.pending_questions ?? [];
  const missing =
    context.priorSkillOutputs?.check_consistency_and_gaps?.result?.missing_critical_data ?? [];
  return pending.length > 0 || missing.length > 0;
}

export function hasDifferential(context: SkillContext): boolean {
  return Boolean(
    context.priorSkillOutputs?.generate_differential?.result?.differential_list?.length
  );
}

export function always(_context: SkillContext): boolean {
  return true;
}
