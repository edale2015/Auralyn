import { ReviewPacket, SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

export async function generatePhysicianReviewPacket(
  context: SkillContext
): Promise<SkillResult<ReviewPacket>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const modifiers =
    context.priorSkillOutputs?.collect_modifiers?.result?.modifiers ??
    context.modifiers ??
    {};

  const normalized =
    context.priorSkillOutputs?.normalize_patient_story?.result ?? {};

  const facts = normalized.structured_facts ?? {};
  const affirmed = normalized.associated_symptoms ?? [];
  const negated = normalized.negated_symptoms ?? [];

  const redFlags =
    context.priorSkillOutputs?.detect_red_flags?.result?.red_flag_hits ?? [];

  const differential =
    context.priorSkillOutputs?.generate_differential?.result?.differential_list ?? [];

  const disposition =
    context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "unknown";

  const dur = modifiers.duration ? String(modifiers.duration) : "";
  const complaintSummary = [
    context.complaintId ?? "unknown_complaint",
    modifiers.age ? `age ${modifiers.age}` : "",
    dur ? `${dur.startsWith("x") ? "" : "x "}${dur}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const packet: ReviewPacket = {
    caseId: context.caseId,
    complaintSummary,
    keyModifiers: modifiers,
    keyFindings: {
      ...facts,
      affirmed_symptoms: affirmed,
      negated_symptoms: negated,
    },
    redFlags: redFlags.map((r: any) => r.label ?? r.id ?? String(r)),
    likelyDiagnoses: differential.slice(0, 3).map((d: any) => d.diagnosis ?? String(d)),
    proposedDisposition: disposition,
    cautionNotes: [
      disposition === "er_now" ? "Immediate escalation indicated" : "",
      redFlags.length ? "Red-flag review required" : "",
      negated.length ? "Negated symptoms parsed and preserved" : "",
    ].filter(Boolean),
    approvalChecklist: [
      "Review complaint summary",
      "Confirm key positives and negatives",
      "Confirm red flags",
      "Confirm top differential",
      "Confirm disposition",
      "Confirm return precautions",
    ],
  };

  const result: SkillResult<ReviewPacket> = {
    skillId: "SK018",
    skillName: "generate_physician_review_packet",
    version: "v1",
    status: "success",
    confidence: 0.95,
    result: packet,
    audit: {
      tablesUsed: ["OUTPUT_TEMPLATES_FALLBACK", "NORMALIZED_FACTS"],
      ruleHits: ["PHYSICIAN_REVIEW_PACKET_CREATED"],
      missingData: disposition === "unknown" ? ["disposition"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["attach_outcome_stub", "measure_workflow_value"],
  };

  assertSkillResultShape(result, "generate_physician_review_packet");
  return result;
}
