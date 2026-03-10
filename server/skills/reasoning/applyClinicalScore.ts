import { SkillContext, SkillResult } from "../shared/skillTypes";
import {
  assertComplaintIdIfNeeded,
  assertContextHasCaseId,
  assertSkillResultShape,
} from "../shared/schemaValidators";

type ApplyClinicalScoreResult = {
  score_name: string;
  score_value: number;
  risk_bucket: string;
  recommended_implication: string;
  components: Record<string, any>;
};

function getFacts(context: SkillContext): Record<string, any> {
  return (
    context.priorSkillOutputs?.normalize_patient_story?.result?.structured_facts ??
    context.priorSkillOutputs?.normalizePatientStory?.result?.structured_facts ??
    {}
  );
}

function applyCentor(context: SkillContext): ApplyClinicalScoreResult {
  const facts = getFacts(context);
  const source = [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  const components: Record<string, any> = {};

  if (facts.fever_present || source.includes("fever")) {
    score += 1;
    components.fever = true;
  }
  if (facts.sore_throat_present || source.includes("exudate") || source.includes("tonsil")) {
    score += 1;
    components.tonsillar_findings = true;
  }
  if (source.includes("tender nodes") || source.includes("lymph node")) {
    score += 1;
    components.tender_anterior_nodes = true;
  }
  if (facts.cough_present === false || source.includes("no cough") || source.includes("denies cough")) {
    score += 1;
    components.absence_of_cough = true;
  }
  const age = Number(context.modifiers?.age);
  if (Number.isFinite(age) && age >= 3 && age <= 14) {
    score += 1;
    components.age_bonus = "+1";
  } else if (Number.isFinite(age) && age >= 45) {
    score -= 1;
    components.age_penalty = "-1";
  }

  let risk_bucket = "low";
  let recommended_implication = "Supportive care / consider no testing depending on full exam";

  if (score >= 4) {
    risk_bucket = "high";
    recommended_implication = "High strep probability; testing/treatment workflow appropriate";
  } else if (score >= 2) {
    risk_bucket = "moderate";
    recommended_implication = "Intermediate risk; testing pathway appropriate";
  }

  return {
    score_name: "Centor",
    score_value: score,
    risk_bucket,
    recommended_implication,
    components,
  };
}

function applyCurb65(context: SkillContext): ApplyClinicalScoreResult {
  const source = [
    context.rawText ?? "",
    ...(context.transcript ?? []).map((t) => t.text),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  const components: Record<string, any> = {};
  const age = Number(context.modifiers?.age);

  if (source.includes("confused")) {
    score += 1;
    components.confusion = true;
  }
  if (Number.isFinite(age) && age >= 65) {
    score += 1;
    components.age65 = true;
  }

  const risk_bucket = score >= 2 ? "high" : score === 1 ? "moderate" : "low";
  const recommended_implication =
    score >= 2
      ? "Higher risk pneumonia pattern; escalated evaluation may be needed"
      : "Low-moderate CURB-65 signal based on available data";

  return {
    score_name: "CURB65",
    score_value: score,
    risk_bucket,
    recommended_implication,
    components,
  };
}

export async function applyClinicalScore(
  context: SkillContext
): Promise<SkillResult<ApplyClinicalScoreResult>> {
  const started = Date.now();
  assertContextHasCaseId(context);
  assertComplaintIdIfNeeded(context, "apply_clinical_score");

  let scored: ApplyClinicalScoreResult;

  switch (context.complaintId) {
    case "sore_throat":
    case "ent_sore_throat":
      scored = applyCentor(context);
      break;
    case "cough":
    case "persistent_cough":
    case "pulm_cough":
      scored = applyCurb65(context);
      break;
    default:
      scored = {
        score_name: "NotApplicable",
        score_value: 0,
        risk_bucket: "n/a",
        recommended_implication: "No formal score configured for this complaint yet",
        components: {},
      };
      break;
  }

  const result: SkillResult<ApplyClinicalScoreResult> = {
    skillId: "SK013",
    skillName: "apply_clinical_score",
    version: "v1",
    status: "success",
    confidence: scored.score_name === "NotApplicable" ? 0.7 : 0.93,
    result: scored,
    audit: {
      tablesUsed: ["SCORING_SYSTEMS_FALLBACK"],
      ruleHits: [scored.score_name],
      missingData: scored.score_name === "NotApplicable" ? ["formal_score_not_configured"] : [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: ["generate_differential", "determine_disposition"],
  };

  assertSkillResultShape(result, "apply_clinical_score");
  return result;
}
