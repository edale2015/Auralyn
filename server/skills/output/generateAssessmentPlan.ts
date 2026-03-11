import { SkillContext, SkillResult } from "../shared/skillTypes";
import { buildReasoningSummary } from "../shared/reasoningSummaryHelper";
import { attachCostMetadata } from "../shared/skillCostTracker";
import {
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

type GenerateAssessmentPlanResult = {
  assessment: string;
  likely_diagnoses: string[];
  plan: string[];
  follow_up: string[];
  return_precautions: string[];
};

function humanizeDiagnosis(dx: string): string {
  return dx
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function defaultPlanByComplaint(complaintId?: string): string[] {
  switch (complaintId) {
    case "sore_throat":
    case "ent_sore_throat":
      return [
        "Assess for strep testing workflow if clinically appropriate.",
        "Support hydration and symptom control.",
        "Review airway danger signs carefully.",
      ];
    case "cough":
    case "pulm_cough":
    case "persistent_cough":
      return [
        "Assess severity of lower vs upper respiratory process.",
        "Consider pneumonia pathway if red flags or high-risk features are present.",
        "Support hydration and symptom monitoring.",
      ];
    case "uti":
    case "gu_uti_symptoms":
    case "gu_dysuria_uti":
      return [
        "Assess for lower vs upper urinary tract infection pattern.",
        "Review fever, flank pain, nausea, and pregnancy risk.",
        "Encourage hydration and follow-up if worsening.",
      ];
    default:
      return [
        "Continue focused clinical evaluation.",
        "Use symptom-guided supportive management where appropriate.",
      ];
  }
}

function defaultReturnPrecautions(complaintId?: string): string[] {
  const general = [
    "Go urgently for trouble breathing, confusion, severe weakness, or rapidly worsening symptoms.",
    "Seek care sooner if you are unable to keep fluids down or symptoms are significantly worsening.",
  ];

  switch (complaintId) {
    case "sore_throat":
    case "ent_sore_throat":
      return [
        "Go urgently for drooling, muffled voice, trouble swallowing, or breathing difficulty.",
        ...general,
      ];
    case "cough":
    case "pulm_cough":
    case "persistent_cough":
      return [
        "Go urgently for shortness of breath, chest pain, confusion, blue lips, or worsening breathing.",
        ...general,
      ];
    case "uti":
    case "gu_uti_symptoms":
    case "gu_dysuria_uti":
      return [
        "Go urgently for fever, vomiting, flank pain, confusion, or worsening illness.",
        ...general,
      ];
    default:
      return general;
  }
}

export async function generateAssessmentPlan(
  context: SkillContext
): Promise<SkillResult<GenerateAssessmentPlanResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);

  const differential =
    context.priorSkillOutputs?.generate_differential?.result?.differential_list ?? [];

  const disposition =
    context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "unknown";

  const clinicalScore =
    context.priorSkillOutputs?.apply_clinical_score?.result ?? null;

  const topDiagnoses = differential.slice(0, 3).map((d: any) =>
    humanizeDiagnosis(d.diagnosis ?? String(d))
  );

  const assessmentParts = [
    context.complaintId ? `Presentation most consistent with ${context.complaintId.replace(/_/g, " ")}` : "",
    topDiagnoses.length ? `Top considerations: ${topDiagnoses.join(", ")}` : "",
    clinicalScore?.score_name && clinicalScore.score_name !== "NotApplicable"
      ? `${clinicalScore.score_name} score suggests ${clinicalScore.risk_bucket} risk`
      : "",
    disposition !== "unknown" ? `Disposition: ${disposition.replace(/_/g, " ")}` : "",
  ].filter(Boolean);

  const plan = defaultPlanByComplaint(context.complaintId);
  const follow_up = [
    "Reassess if symptoms worsen, fail to improve, or new red flags develop.",
    disposition === "routine_evaluation"
      ? "Routine follow-up may be appropriate depending on clinical course."
      : "Prompt follow-up is appropriate given the current disposition.",
  ];

  const return_precautions = defaultReturnPrecautions(context.complaintId);

  const ruleHits = [
    topDiagnoses.length ? "TOP_DIAGNOSES_INCLUDED" : "",
    disposition !== "unknown" ? "DISPOSITION_INCLUDED" : "",
  ].filter(Boolean);

  let result: SkillResult<GenerateAssessmentPlanResult> = {
    skillId: "SK015",
    skillName: "generate_assessment_plan",
    version: "v1",
    status: "success",
    confidence: 0.93,
    reasoning_summary: buildReasoningSummary({
      skillName: "generate_assessment_plan",
      headline: `Assessment generated. Top dx: ${topDiagnoses.slice(0, 2).join(", ") || "none"}. Disposition: ${disposition}. Plan has ${plan.length} step(s).`,
      matchedRules: ruleHits,
      missingData: topDiagnoses.length ? [] : ["differential_list"],
      confidence: 0.93,
    }),
    result: {
      assessment: assessmentParts.join(". "),
      likely_diagnoses: topDiagnoses,
      plan,
      follow_up,
      return_precautions,
    },
    audit: {
      tablesUsed: ["OUTPUT_TEMPLATES_FALLBACK", "DIFFERENTIAL_OUTPUTS"],
      ruleHits,
      missingData: topDiagnoses.length ? [] : ["differential_list"],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["generate_physician_review_packet", "attach_outcome_stub"],
  };

  result = attachCostMetadata(result, {
    engineType: "rules",
    modelUsed: "",
    promptTokens: 0,
    completionTokens: 0,
    complaintFamily: context.complaintId,
  });

  assertSkillResultShape(result, "generate_assessment_plan");
  return result;
}
