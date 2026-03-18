export const environmentalAdvancedPacks = [
  {
    id: "env_air_pollution",
    title: "Air Pollution Exposure",
    redFlags: ["sob", "chest_pain"],
    autoEscalateRules: ["sob=yes", "chest_pain=yes"],
    autoReviewRules: ["asthma=yes"],
  },
  {
    id: "env_mold_exposure",
    title: "Mold Exposure",
    redFlags: [],
    autoEscalateRules: [],
    autoReviewRules: ["sob=yes", "chronic_cough=yes"],
  },
  {
    id: "env_noise_exposure",
    title: "Noise-Induced Hearing Damage",
    redFlags: ["sudden_hearing_loss"],
    autoEscalateRules: ["sudden_hearing_loss=yes"],
    autoReviewRules: ["ringing=yes"],
  },
  {
    id: "env_motion_sickness",
    title: "Motion Sickness",
    redFlags: [],
    autoEscalateRules: [],
    autoReviewRules: ["vomiting=yes"],
  },
  {
    id: "env_travel_related",
    title: "Travel-Related Illness",
    redFlags: ["fever", "rash"],
    autoEscalateRules: ["fever=yes"],
    autoReviewRules: ["travel=yes"],
  },
];

export const environmentalAdvancedModifiers = [
  {
    id: "env_mod_elderly",
    appliesToSymptoms: ["env_heat_illness", "env_cold_exposure"],
    triggers: ["age>70"],
    riskAdjustmentsJson: JSON.stringify([
      {
        condition: "age>70",
        action: "raise_risk",
        amount: 20,
        reason: "Temperature vulnerability",
      },
    ]),
  },
];
