export type ComplaintCompletenessInput = {
  complaint: string;
  answeredQuestions?: Record<string, any>;
  normalizedSymptoms?: string[];
};

export type ComplaintCompletenessOutput = {
  complete: boolean;
  completenessScore: number;
  requiredQuestions: string[];
  missingRequiredQuestions: string[];
  recommendedQuestions: string[];
  missingRecommendedQuestions: string[];
  blockerReason?: string;
};

type CompletenessRule = {
  required: string[];
  recommended: string[];
};

const RULES: Record<string, CompletenessRule> = {
  chest_pain: {
    required:    ["age", "onset", "duration", "shortness_of_breath", "exertional", "radiation", "diaphoresis"],
    recommended: ["nausea", "pleuritic", "reproducible", "pmh_cad", "anticoagulated"],
  },
  shortness_of_breath: {
    required:    ["age", "onset", "duration", "fever", "chest_pain", "wheezing", "oxygen_saturation_if_available"],
    recommended: ["cough", "leg_swelling", "history_asthma", "history_copd"],
  },
  headache: {
    required:    ["onset", "duration", "worst_of_life", "neurologic_deficit", "fever", "neck_stiffness"],
    recommended: ["photophobia", "vomiting", "pregnant", "trauma"],
  },
  abdominal_pain: {
    required:    ["location", "duration", "vomiting", "fever", "pregnant_if_applicable", "peritoneal_signs_if_known"],
    recommended: ["diarrhea", "constipation", "urinary_symptoms", "prior_surgery"],
  },
  dysuria: {
    required:    ["duration", "frequency", "urgency", "fever", "flank_pain"],
    recommended: ["pregnant_if_applicable", "hematuria", "vaginal_discharge", "back_pain"],
  },
  sore_throat: {
    required:    ["duration", "fever", "drooling", "voice_change", "neck_swelling"],
    recommended: ["cough", "tonsillar_exudate", "sick_contacts"],
  },
  cough: {
    required:    ["duration", "fever", "shortness_of_breath", "chest_pain"],
    recommended: ["wheezing", "productive", "hemoptysis", "history_asthma", "history_copd"],
  },
  ear_pain: {
    required:    ["duration", "fever", "drainage", "hearing_change"],
    recommended: ["swimming", "uri_symptoms", "mastoid_pain"],
  },
  sinus_pressure: {
    required:    ["duration", "fever", "facial_pain", "worsening_after_improving"],
    recommended: ["tooth_pain", "purulent_discharge", "headache"],
  },
  back_pain: {
    required:    ["duration", "onset", "fever", "bowel_bladder_change", "trauma"],
    recommended: ["radiation", "leg_weakness", "saddle_anesthesia", "prior_episodes"],
  },
  rash: {
    required:    ["duration", "fever", "distribution", "itching"],
    recommended: ["recent_medication", "sick_contacts", "travel", "allergy_history"],
  },
  dizziness: {
    required:    ["onset", "type_vertigo_vs_lightheadedness", "syncope", "chest_pain"],
    recommended: ["fever", "head_trauma", "neuro_deficit", "hearing_loss"],
  },
};

function isAnswered(v: any): boolean {
  return v !== undefined && v !== null && v !== "";
}

export function complaintCompletenessEngine(
  input: ComplaintCompletenessInput
): ComplaintCompletenessOutput {
  const answered = input.answeredQuestions || {};
  const rule     = RULES[input.complaint] ?? { required: [], recommended: [] };

  const missingRequiredQuestions    = rule.required.filter((q) => !isAnswered(answered[q]));
  const missingRecommendedQuestions = rule.recommended.filter((q) => !isAnswered(answered[q]));

  const total        = rule.required.length + rule.recommended.length;
  const answeredCount =
    (rule.required.length    - missingRequiredQuestions.length) +
    (rule.recommended.length - missingRecommendedQuestions.length);

  const completenessScore = total > 0 ? answeredCount / total : 1;
  const complete          = missingRequiredQuestions.length === 0;

  return {
    complete,
    completenessScore: Number(completenessScore.toFixed(3)),
    requiredQuestions:            rule.required,
    missingRequiredQuestions,
    recommendedQuestions:         rule.recommended,
    missingRecommendedQuestions,
    blockerReason: complete ? undefined : "Missing required complaint questions",
  };
}
