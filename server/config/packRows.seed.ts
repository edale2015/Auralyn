import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
} from "../../shared/packRows";

export const symptomPackRows: SymptomPackRow[] = [
  {
    id: "card_chest_pain",
    system: "cardiology",
    tier: "symptom",
    title: "Chest Pain",
    isActive: true,
    version: 1,
    tags: ["high_risk", "acs", "dissection"],
    aliases: ["chest pain", "chest pressure", "tightness in chest"],
    likelyDisposition: "er_now",
    questionsJson: JSON.stringify([
      { id: "sob", prompt: "Any shortness of breath?", type: "yes_no", priority: 1, required: true },
      { id: "radiation", prompt: "Pain to arm, jaw, or back?", type: "yes_no", priority: 2 },
      { id: "exertional", prompt: "Triggered or worse with exertion?", type: "yes_no", priority: 3 },
      { id: "fainting", prompt: "Any fainting or near-fainting?", type: "yes_no", priority: 4 },
      { id: "sweating_nausea", prompt: "Cold sweat or nausea?", type: "yes_no", priority: 5 },
      { id: "tearing", prompt: "Sudden tearing pain to the back?", type: "yes_no", priority: 6 }
    ]),
    redFlags: ["sob", "radiation", "fainting", "sweating_nausea", "tearing"],
    autoEscalateRules: [
      "sob=yes",
      "radiation=yes",
      "fainting=yes",
      "sweating_nausea=yes",
      "tearing=yes"
    ],
    autoReviewRules: [],
    planTemplateKey: "card_chest_pain",
  },
  {
    id: "ortho_back_pain",
    system: "ortho",
    tier: "symptom",
    title: "Back Pain",
    isActive: true,
    version: 1,
    tags: ["msk", "spine"],
    aliases: ["back pain", "low back pain"],
    likelyDisposition: "self_care",
    questionsJson: JSON.stringify([
      { id: "injury", prompt: "Any fall, lifting injury, or trauma?", type: "yes_no", priority: 1 },
      { id: "leg_weakness", prompt: "Any leg weakness?", type: "yes_no", priority: 2 },
      { id: "groin_numbness", prompt: "Any numbness in the groin area?", type: "yes_no", priority: 3 },
      { id: "bowel_bladder", prompt: "Any loss of bowel or bladder control?", type: "yes_no", priority: 4 },
      { id: "fever", prompt: "Any fever?", type: "yes_no", priority: 5 },
      { id: "ivdu_cancer", prompt: "IV drug use, cancer, or immune suppression?", type: "yes_no", priority: 6 }
    ]),
    redFlags: ["leg_weakness", "groin_numbness", "bowel_bladder", "fever"],
    autoEscalateRules: [
      "groin_numbness=yes",
      "bowel_bladder=yes",
      "leg_weakness=yes"
    ],
    autoReviewRules: [
      "fever=yes",
      "ivdu_cancer=yes",
      "injury=yes"
    ],
    planTemplateKey: "ortho_back_pain",
  },
  {
    id: "pulm_cough",
    system: "pulmonary",
    tier: "symptom",
    title: "Cough",
    isActive: true,
    version: 1,
    aliases: ["cough", "bronchitis", "cold"],
    likelyDisposition: "self_care",
    questionsJson: JSON.stringify([
      { id: "duration", prompt: "How long have you had the cough?", type: "duration", priority: 1 },
      { id: "sob", prompt: "Any shortness of breath?", type: "yes_no", priority: 2 },
      { id: "chest_pain", prompt: "Any chest pain?", type: "yes_no", priority: 3 },
      { id: "fever", prompt: "Any fever?", type: "yes_no", priority: 4 },
      { id: "blood", prompt: "Any coughing up blood?", type: "yes_no", priority: 5 },
      { id: "asthma_copd", prompt: "Asthma or COPD history?", type: "yes_no", priority: 6 }
    ]),
    redFlags: ["sob", "chest_pain", "blood"],
    autoEscalateRules: ["sob=yes", "chest_pain=yes", "blood=yes"],
    autoReviewRules: ["fever=yes", "asthma_copd=yes"],
    planTemplateKey: "pulm_cough",
  }
];

export const modifierPackRows: ModifierPackRow[] = [
  {
    id: "card_mod_congenital_heart",
    system: "cardiology",
    tier: "modifier",
    title: "Congenital Heart Disease",
    isActive: true,
    version: 1,
    tags: ["modifier", "high_risk_pmh"],
    appliesToSymptoms: [
      "card_shortness_of_breath",
      "card_palpitations",
      "card_syncope",
      "card_chf_fluid_overload",
      "card_chest_pain"
    ],
    triggers: ["congenital_heart_disease=yes"],
    riskAdjustmentsJson: JSON.stringify([
      {
        condition: "congenital_heart_disease=yes",
        action: "raise_risk",
        amount: 25,
        reason: "Congenital disease raises complexity"
      },
      {
        condition: "congenital_heart_disease=yes",
        action: "force_review",
        reason: "Needs clinician-level interpretation"
      }
    ]),
  },
  {
    id: "ortho_mod_anticoagulation",
    system: "ortho",
    tier: "modifier",
    title: "Anticoagulation",
    isActive: true,
    version: 1,
    appliesToSymptoms: ["ortho_post_fall_injury", "ortho_back_pain", "ortho_hip_pelvis_pain"],
    triggers: ["anticoagulated=yes"],
    riskAdjustmentsJson: JSON.stringify([
      {
        condition: "anticoagulated=yes",
        action: "raise_risk",
        amount: 20,
        reason: "Bleeding risk after injury"
      },
      {
        condition: "head_hit=yes AND anticoagulated=yes",
        action: "force_escalation",
        reason: "Head trauma on anticoagulation"
      }
    ]),
  }
];

export const clinicianAlgorithmRows: ClinicianAlgorithmRow[] = [
  {
    id: "card_algo_acls_tachy",
    system: "cardiology",
    tier: "clinician_algorithm",
    title: "Tachyarrhythmia ACLS Support",
    isActive: true,
    version: 1,
    tags: ["acls", "emergency"],
    entryCriteria: ["unstable_tachycardia=yes", "very_rapid_pulse=yes", "palpitations=yes AND fainting=yes"],
    requiredInputs: ["heart_rate", "bp", "mental_status", "chest_pain", "sob", "12lead_available"],
    outputActions: [
      "flag unstable vs stable",
      "recommend immediate ER escalation if unstable",
      "surface synchronized cardioversion reference"
    ],
    notes: ["Clinician-facing only"],
  },
  {
    id: "ortho_algo_cauda_equina_screen",
    system: "ortho",
    tier: "clinician_algorithm",
    title: "Cauda Equina Screen",
    isActive: true,
    version: 1,
    entryCriteria: ["groin_numbness=yes", "bowel_bladder=yes", "leg_weakness=yes AND severe_back_pain=yes"],
    requiredInputs: ["groin_numbness", "bowel_bladder", "leg_weakness", "severe_back_pain"],
    outputActions: [
      "flag possible cauda equina",
      "recommend immediate ER evaluation",
      "document neuro red flags"
    ],
  }
];
