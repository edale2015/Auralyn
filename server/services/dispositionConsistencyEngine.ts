import type {
  CanonicalDispositionPlan,
  ClinicalFeatureMap,
  SyndromeCandidate,
} from "../../shared/clinicalConsistency";

export function extractRedFlags(features: ClinicalFeatureMap): string[] {
  const flags: string[] = [];

  if (features["respiratory_distress"]) flags.push("respiratory_distress");
  if (features["hypoxia"])              flags.push("hypoxia");
  if (features["altered_mental_status"]) flags.push("altered_mental_status");
  if (features["severe_dehydration"])   flags.push("severe_dehydration");
  if (features["unable_to_swallow"])    flags.push("unable_to_swallow");
  if (features["airway_concern"])       flags.push("airway_concern");
  if (features["flank_pain"] && features["fever_over_38"]) flags.push("possible_pyelonephritis");
  if (features["pelvic_pain"] && features["fever_over_38"]) flags.push("possible_pid_or_other_complication");

  return flags;
}

export function buildCanonicalDisposition(
  complaint: string,
  winning: SyndromeCandidate | null,
  features: ClinicalFeatureMap
): CanonicalDispositionPlan {
  const flags = extractRedFlags(features);

  if (flags.length > 0) {
    return {
      disposition: "er_now",
      urgency: 5,
      rationale: ["Disposition escalated due to red flags."],
      redFlagsTriggered: flags,
      followUpWindow: "Immediate",
    };
  }

  if (!winning) {
    return {
      disposition: "follow_up_primary_care",
      urgency: 2,
      rationale: [
        "No dominant syndrome identified.",
        "Avoid overcalling severity and avoid reflex prescribing.",
      ],
      redFlagsTriggered: [],
      followUpWindow: "24-72 hours depending on symptom progression",
    };
  }

  switch (winning.syndromeId) {
    case "viral_pharyngitis":
    case "influenza_like_illness":
      return {
        disposition: "home_supportive_care",
        urgency: 1,
        rationale: ["Stable syndrome without high-risk features."],
        redFlagsTriggered: [],
        followUpWindow: "PRN worsening or 48-72 hours",
      };

    case "gas_centor_compatible":
      return {
        disposition: "home_with_rx",
        urgency: 2,
        rationale: ["Strep-compatible stable outpatient syndrome."],
        redFlagsTriggered: [],
        followUpWindow: "48 hours if not improving",
      };

    case "simple_cystitis":
      return {
        disposition: "home_with_rx",
        urgency: 2,
        rationale: ["Typical outpatient cystitis pattern without upper tract or systemic red flags."],
        redFlagsTriggered: [],
        followUpWindow: "48 hours if persistent symptoms",
      };

    case "asymptomatic_bacteriuria":
      return {
        disposition: "follow_up_primary_care",
        urgency: 1,
        rationale: ["No acute treatment needed; outpatient follow-up if clinically indicated."],
        redFlagsTriggered: [],
        followUpWindow: "Routine",
      };

    case "bacterial_vaginosis_symptomatic":
      return {
        disposition: "home_with_rx",
        urgency: 1,
        rationale: ["Symptomatic but stable outpatient syndrome."],
        redFlagsTriggered: [],
        followUpWindow: "1 week if persistent",
      };

    default:
      return {
        disposition: "follow_up_primary_care",
        urgency: 2,
        rationale: ["Conservative standardized outpatient pathway."],
        redFlagsTriggered: [],
        followUpWindow: "24-72 hours",
      };
  }
}
