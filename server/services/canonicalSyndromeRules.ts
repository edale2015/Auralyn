import type { ClinicalFeatureMap, SyndromeCandidate } from "../../shared/clinicalConsistency";

export interface SyndromeRule {
  syndromeId: string;
  label: string;
  complaint: string;
  required: string[];
  positiveWeights: Record<string, number>;
  negativeWeights: Record<string, number>;
  exclusions?: string[];
}

const RULES: SyndromeRule[] = [
  {
    syndromeId: "viral_pharyngitis",
    label: "Viral pharyngitis / URI syndrome",
    complaint: "sore_throat",
    required: ["sore_throat"],
    positiveWeights: {
      cough: 2,
      rhinorrhea: 2,
      hoarseness: 2,
      conjunctivitis: 1,
      low_grade_fever: 1,
    },
    negativeWeights: {
      tonsillar_exudate: 2,
      tender_anterior_cervical_nodes: 2,
      fever_over_38: 2,
      no_cough: 1,
    },
  },
  {
    syndromeId: "gas_centor_compatible",
    label: "Group A strep compatible syndrome",
    complaint: "sore_throat",
    required: ["sore_throat"],
    positiveWeights: {
      tonsillar_exudate: 3,
      tender_anterior_cervical_nodes: 2,
      fever_over_38: 2,
      no_cough: 2,
    },
    negativeWeights: {
      cough: 2,
      rhinorrhea: 2,
      hoarseness: 1,
    },
  },
  {
    syndromeId: "asymptomatic_bacteriuria",
    label: "Asymptomatic bacteriuria",
    complaint: "urine_result_review",
    required: ["positive_urine_test", "no_urinary_symptoms"],
    positiveWeights: {
      positive_urine_test: 3,
      no_urinary_symptoms: 3,
    },
    negativeWeights: {
      dysuria: 3,
      frequency: 2,
      urgency: 2,
      flank_pain: 3,
      fever_over_38: 3,
    },
  },
  {
    syndromeId: "simple_cystitis",
    label: "Acute uncomplicated cystitis",
    complaint: "urinary_symptoms",
    required: ["dysuria"],
    positiveWeights: {
      dysuria: 3,
      frequency: 2,
      urgency: 2,
      no_vaginal_discharge: 1,
    },
    negativeWeights: {
      flank_pain: 3,
      fever_over_38: 3,
      vomiting: 2,
      pregnancy_high_risk: 2,
    },
  },
  {
    syndromeId: "bacterial_vaginosis_symptomatic",
    label: "Symptomatic bacterial vaginosis",
    complaint: "vaginal_discharge",
    required: ["vaginal_discharge"],
    positiveWeights: {
      thin_gray_discharge: 2,
      fishy_odor: 3,
    },
    negativeWeights: {
      no_vaginal_symptoms: 4,
      pelvic_pain: 2,
      fever_over_38: 2,
    },
  },
  {
    syndromeId: "influenza_like_illness",
    label: "Influenza-like illness",
    complaint: "flu_like",
    required: ["feverish_or_fever", "body_aches"],
    positiveWeights: {
      feverish_or_fever: 3,
      body_aches: 2,
      acute_onset: 2,
      cough: 1,
      sick_contacts: 1,
    },
    negativeWeights: {
      dysuria: 2,
      vaginal_discharge: 2,
      isolated_sore_throat_only: 1,
    },
  },
];

export function getSyndromeRules(): SyndromeRule[] {
  return RULES;
}

function hasFeature(features: ClinicalFeatureMap, key: string): boolean {
  return Boolean(features[key]);
}

export function scoreSyndromes(
  complaint: string,
  features: ClinicalFeatureMap
): SyndromeCandidate[] {
  const candidates = RULES.filter((r) => r.complaint === complaint);

  return candidates.map((rule) => {
    const requiredFeaturesMet = rule.required.every((req) => hasFeature(features, req));
    let score = requiredFeaturesMet ? 5 : -999;
    const rationale: string[] = [];

    for (const [k, w] of Object.entries(rule.positiveWeights)) {
      if (hasFeature(features, k)) {
        score += w;
        rationale.push(`+${w} ${k}`);
      }
    }

    for (const [k, w] of Object.entries(rule.negativeWeights)) {
      if (hasFeature(features, k)) {
        score -= w;
        rationale.push(`-${w} ${k}`);
      }
    }

    if (rule.exclusions?.some((ex) => hasFeature(features, ex))) {
      score -= 100;
      const triggered = rule.exclusions.filter((ex) => hasFeature(features, ex));
      rationale.push(`excluded by ${triggered.join(", ")}`);
    }

    return {
      syndromeId: rule.syndromeId,
      label: rule.label,
      score,
      rationale,
      requiredFeaturesMet,
    };
  }).sort((a, b) => b.score - a.score);
}
