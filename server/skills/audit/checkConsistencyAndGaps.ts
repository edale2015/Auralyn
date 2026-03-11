import { SkillContext, SkillResult } from "../shared/skillTypes";
import { buildReasoningSummary } from "../shared/reasoningSummaryHelper";
import { attachCostMetadata } from "../shared/skillCostTracker";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

type CheckConsistencyAndGapsResult = {
  inconsistencies: string[];
  missing_critical_data: string[];
  clarifying_questions: string[];
};

function getNormalizedResult(context: SkillContext): any {
  return context.priorSkillOutputs?.normalize_patient_story?.result ?? {};
}

function getDisposition(context: SkillContext): string {
  return context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "";
}

function getRedFlagSeverity(context: SkillContext): string {
  return context.priorSkillOutputs?.detect_red_flags?.result?.severity ?? "none";
}

function requiredByComplaint(complaintId: string): string[] {
  switch (complaintId) {
    case "sore_throat":
    case "ent_sore_throat":
      return ["duration", "fever_present", "cough_present"];
    case "cough":
    case "pulm_cough":
    case "persistent_cough":
      return ["duration", "fever_present", "sob_present", "chest_pain_present"];
    case "uti":
    case "gu_uti_symptoms":
    case "gu_dysuria_uti":
      return ["duration", "dysuria_present", "urinary_frequency_present", "fever_present"];
    case "chest_pain":
      return ["duration", "sob_present", "chest_pain_present"];
    case "abdominal_pain":
      return ["duration", "abdominal_pain_present"];
    default:
      return ["duration"];
  }
}

export async function checkConsistencyAndGaps(
  context: SkillContext
): Promise<SkillResult<CheckConsistencyAndGapsResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "check_consistency_and_gaps");

  const normalized = getNormalizedResult(context);
  const facts = normalized.structured_facts ?? {};
  const affirmed: string[] = normalized.associated_symptoms ?? [];
  const negated: string[] = normalized.negated_symptoms ?? [];
  const modifiers = context.modifiers ?? {};
  const inconsistencies: string[] = [];
  const missing_critical_data: string[] = [];
  const clarifying_questions: string[] = [];

  const affirmedSet = new Set(affirmed.map((s) => s.toLowerCase()));
  const negatedSet = new Set(negated.map((s) => s.toLowerCase()));

  for (const symptom of affirmedSet) {
    if (negatedSet.has(symptom)) {
      inconsistencies.push(`Symptom both affirmed and negated: ${symptom}`);
    }
  }

  for (const field of requiredByComplaint(context.complaintId!)) {
    if (!(field in facts) || facts[field] === "" || facts[field] == null) {
      missing_critical_data.push(field);
    }
  }

  if (modifiers.age == null && !missing_critical_data.includes("age")) {
    missing_critical_data.push("age");
  }
  if (!modifiers.duration && !facts.duration && !missing_critical_data.includes("duration")) {
    missing_critical_data.push("duration");
  }

  const redFlagSeverity = getRedFlagSeverity(context);
  const disposition = getDisposition(context);
  if (
    disposition &&
    (redFlagSeverity === "critical" || redFlagSeverity === "high") &&
    !["er_now", "urgent_same_day"].includes(disposition)
  ) {
    inconsistencies.push(
      `Red-flag severity ${redFlagSeverity} appears mismatched with disposition ${disposition}`
    );
  }

  for (const field of missing_critical_data) {
    switch (field) {
      case "duration":
        clarifying_questions.push("How long has this been going on?");
        break;
      case "fever_present":
        clarifying_questions.push("Have you had a fever?");
        break;
      case "cough_present":
        clarifying_questions.push("Are you having a cough?");
        break;
      case "sob_present":
        clarifying_questions.push("Any shortness of breath?");
        break;
      case "chest_pain_present":
        clarifying_questions.push("Any chest pain?");
        break;
      case "dysuria_present":
        clarifying_questions.push("Do you have burning with urination?");
        break;
      case "urinary_frequency_present":
        clarifying_questions.push("Are you going more often than usual?");
        break;
      case "abdominal_pain_present":
        clarifying_questions.push("Are you having abdominal pain?");
        break;
      case "age":
        clarifying_questions.push("How old is the patient?");
        break;
      default:
        clarifying_questions.push(`Please clarify: ${field}`);
        break;
    }
  }

  const ruleHits = [
    inconsistencies.length ? "INCONSISTENCY_DETECTED" : "",
    missing_critical_data.length ? "MISSING_CRITICAL_DATA" : "",
  ].filter(Boolean);

  let result: SkillResult<CheckConsistencyAndGapsResult> = {
    skillId: "SK014",
    skillName: "check_consistency_and_gaps",
    version: "v1",
    status: "success",
    confidence: 0.9,
    reasoning_summary: buildReasoningSummary({
      skillName: "check_consistency_and_gaps",
      headline: inconsistencies.length || missing_critical_data.length
        ? `Found ${inconsistencies.length} inconsistency(ies) and ${missing_critical_data.length} data gap(s).`
        : "No inconsistencies or critical data gaps detected.",
      matchedRules: ruleHits,
      missingData: missing_critical_data,
      confidence: 0.9,
    }),
    result: { inconsistencies, missing_critical_data, clarifying_questions },
    audit: {
      tablesUsed: ["NORMALIZED_FACTS", "COMPLAINT_REQUIREMENTS_FALLBACK"],
      ruleHits,
      missingData: missing_critical_data,
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["determine_disposition", "generate_assessment_plan"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: context.complaintId,
  });

  assertSkillResultShape(result, "check_consistency_and_gaps");
  return result;
}
