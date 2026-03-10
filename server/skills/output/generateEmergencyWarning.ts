import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

type GenerateEmergencyWarningResult = {
  warning_block: string;
  instructions: string[];
};

function defaultWarningForComplaint(complaintId?: string): string[] {
  switch (complaintId) {
    case "sore_throat":
    case "ent_sore_throat":
      return [
        "Seek emergency care now if there is drooling, trouble swallowing, muffled voice, stridor, or breathing difficulty.",
      ];
    case "cough":
    case "pulm_cough":
    case "persistent_cough":
      return [
        "Seek urgent or emergency care now for shortness of breath, chest pain, confusion, blue lips, or worsening breathing.",
      ];
    case "chest_pain":
      return [
        "Chest pain can be serious. Seek emergency care now, especially if it is severe, associated with shortness of breath, sweating, fainting, or radiation.",
      ];
    default:
      return [
        "Seek urgent emergency care now if symptoms are severe, rapidly worsening, or involve breathing difficulty, confusion, fainting, or inability to keep fluids down.",
      ];
  }
}

export async function generateEmergencyWarning(
  context: SkillContext
): Promise<SkillResult<GenerateEmergencyWarningResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const disposition =
    context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "unknown";

  const redFlags =
    context.priorSkillOutputs?.detect_red_flags?.result?.red_flag_hits ?? [];

  const shouldWarn = ["er_now", "urgent_same_day"].includes(disposition) || redFlags.length > 0;

  const instructions = shouldWarn ? defaultWarningForComplaint(context.complaintId) : [];
  const warning_block = shouldWarn
    ? instructions.join(" ")
    : "";

  const result: SkillResult<GenerateEmergencyWarningResult> = {
    skillId: "SK007",
    skillName: "generate_emergency_warning",
    version: "v1",
    status: "success",
    confidence: 0.96,
    result: {
      warning_block,
      instructions,
    },
    audit: {
      tablesUsed: ["OUTPUT_TEMPLATES_FALLBACK", "DISPOSITION_OUTPUTS"],
      ruleHits: shouldWarn ? ["EMERGENCY_WARNING_RENDERED"] : [],
      missingData: shouldWarn && !instructions.length ? ["warning_template"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["generate_assessment_plan", "generate_physician_review_packet"],
  };

  assertSkillResultShape(result, "generate_emergency_warning");
  return result;
}
