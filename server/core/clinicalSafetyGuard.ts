export interface SafetyGuardResult {
  disposition: "ER_NOW" | null;
  triggerRule: string | null;
  matchedSymptoms: string[];
}

interface GuardRule {
  id: string;
  description: string;
  required: string[];       // ALL of these must be present
  anyOf?: string[];         // At least one of these (optional)
  disposition: "ER_NOW";
}

const GUARD_RULES: GuardRule[] = [
  {
    id: "RULE_ANAPHYLAXIS",
    description: "Anaphylaxis — airway compromise",
    required: [],
    anyOf: ["throat_tightness", "tongue_swelling", "anaphylaxis"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_ACS",
    description: "Suspected ACS — chest pain + diaphoresis",
    required: ["chest_pain", "diaphoresis"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_ACS_RADIATION",
    description: "Suspected ACS — chest pain + left arm radiation",
    required: ["chest_pain", "left_arm_radiation"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_STROKE",
    description: "FAST stroke criteria",
    required: [],
    anyOf: ["facial_droop", "focal_weakness", "speech_difficulty"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_SAH",
    description: "Thunderclap headache — subarachnoid hemorrhage until proven otherwise",
    required: ["thunderclap_headache"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_MENINGITIS",
    description: "Fever + neck stiffness — meningitis",
    required: ["fever", "neck_stiffness"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_PULMONARY_EMBOLISM",
    description: "Dyspnea + pleuritic pain — PE risk",
    required: ["dyspnea", "pleuritic_pain"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_EPIGLOTTITIS",
    description: "Stridor + drooling — epiglottitis",
    required: [],
    anyOf: ["stridor", "drooling"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_TESTICULAR_TORSION",
    description: "Acute testicular pain — torsion until proven otherwise",
    required: ["testicular_pain"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_ECTOPIC",
    description: "Pelvic pain + possible pregnancy — ectopic risk",
    required: ["pelvic_pain", "ectopic_pregnancy"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_SEPSIS",
    description: "High fever + altered mentation — sepsis",
    required: ["high_fever", "altered_mentation"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_SEIZURE",
    description: "Active or recent seizure",
    required: ["seizure"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_VISION_LOSS",
    description: "Sudden vision loss — ophthalmologic emergency",
    required: ["vision_loss"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_PETECHIAE",
    description: "Fever + petechiae — meningococcemia",
    required: ["fever", "petechiae"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_PERITONITIS",
    description: "Rebound tenderness — peritonitis/surgical abdomen",
    required: ["rebound_tenderness"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_AORTIC",
    description: "Tearing back pain — aortic dissection / aneurysm",
    required: ["back_pain", "diaphoresis"],
    anyOf: ["chest_pain"],
    disposition: "ER_NOW",
  },
  {
    id: "RULE_SOB_CYANOSIS",
    description: "Severe dyspnea — respiratory failure",
    required: ["dyspnea", "altered_mentation"],
    disposition: "ER_NOW",
  },
];

export function safetyGuard(symptoms: string[]): SafetyGuardResult {
  const symptomSet = new Set(symptoms);

  for (const rule of GUARD_RULES) {
    const allRequired = rule.required.every((s) => symptomSet.has(s));
    const anyMatched = !rule.anyOf || rule.anyOf.length === 0 || rule.anyOf.some((s) => symptomSet.has(s));

    if (allRequired && anyMatched) {
      const matchedSymptoms = [
        ...rule.required.filter((s) => symptomSet.has(s)),
        ...(rule.anyOf?.filter((s) => symptomSet.has(s)) ?? []),
      ];
      return {
        disposition: rule.disposition,
        triggerRule: rule.id,
        matchedSymptoms,
      };
    }
  }

  return { disposition: null, triggerRule: null, matchedSymptoms: [] };
}
