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

  const facts =
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.priorSkillOutputs?.normalizePatientStory?.result?.structured_facts ??
    {};

  const redFlags =
    context.priorSkillOutputs?.detect_red_flags?.result?.red_flag_hits ??
    context.priorSkillOutputs?.detectRedFlags?.result?.red_flag_hits ??
    [];

  const differential =
    context.priorSkillOutputs?.generate_differential?.result?.differential_list ??
    context.priorSkillOutputs?.generateDifferential?.result?.differential_list ??
    [];

  const disposition =
    context.priorSkillOutputs?.determine_disposition?.result?.disposition ??
    context.priorSkillOutputs?.determineDisposition?.result?.disposition ??
    "unknown";

  const complaintSummary = [
    context.complaintId ?? "unknown_complaint",
    modifiers.age ? `age ${modifiers.age}` : "",
    modifiers.duration ? `${String(modifiers.duration).startsWith("x") ? "" : "x "}${modifiers.duration}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const packet: ReviewPacket = {
    caseId: context.caseId,
    complaintSummary,
    keyModifiers: modifiers,
    keyFindings: facts,
    redFlags: redFlags.map((r: any) => r.label ?? r.id ?? String(r)),
    likelyDiagnoses: differential.slice(0, 3).map((d: any) => d.diagnosis ?? String(d)),
    proposedDisposition: disposition,
    cautionNotes: [
      disposition === "er_now" ? "Immediate escalation indicated" : "",
      redFlags.length ? "Red-flag review required" : "",
    ].filter(Boolean),
    approvalChecklist: [
      "Review complaint summary",
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
    confidence: 0.94,
    result: packet,
    audit: {
      tablesUsed: ["OUTPUT_TEMPLATES_FALLBACK"],
      ruleHits: ["PHYSICIAN_REVIEW_PACKET_CREATED"],
      missingData: disposition === "unknown" ? ["disposition"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["attach_outcome_stub", "measure_workflow_value"],
  };

  assertSkillResultShape(result, "generate_physician_review_packet");
  return result;
}
