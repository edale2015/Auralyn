export interface PatientContext {
  age?: number;
  pregnant?: boolean;
  comorbidities?: string[];
  medications?: string[];
  allergies?: string[];
  weight?: number;
  smokingStatus?: string;
}

export interface PersonalizationModifiers {
  highRiskAge: boolean;
  pediatricRisk: boolean;
  pregnancyRisk: boolean;
  infectionRiskBoost: boolean;
  bleedingRisk: boolean;
  allergyAlert: boolean;
  smokingRisk: boolean;
  obesityRisk: boolean;
  riskMultiplier: number;
  appliedRules: string[];
}

export function applyPatientPersonalization(context: PatientContext): PersonalizationModifiers {
  const modifiers: PersonalizationModifiers = {
    highRiskAge: false,
    pediatricRisk: false,
    pregnancyRisk: false,
    infectionRiskBoost: false,
    bleedingRisk: false,
    allergyAlert: false,
    smokingRisk: false,
    obesityRisk: false,
    riskMultiplier: 1.0,
    appliedRules: [],
  };

  if (context.age != null && context.age > 65) {
    modifiers.highRiskAge = true;
    modifiers.riskMultiplier *= 1.3;
    modifiers.appliedRules.push("age_over_65_escalation");
  }

  if (context.age != null && context.age < 5) {
    modifiers.pediatricRisk = true;
    modifiers.riskMultiplier *= 1.2;
    modifiers.appliedRules.push("pediatric_risk_escalation");
  }

  if (context.pregnant) {
    modifiers.pregnancyRisk = true;
    modifiers.riskMultiplier *= 1.4;
    modifiers.appliedRules.push("pregnancy_threshold_adjustment");
  }

  if (context.comorbidities?.includes("immunocompromised")) {
    modifiers.infectionRiskBoost = true;
    modifiers.riskMultiplier *= 1.5;
    modifiers.appliedRules.push("immunocompromised_infection_boost");
  }

  if (context.medications?.includes("anticoagulant")) {
    modifiers.bleedingRisk = true;
    modifiers.riskMultiplier *= 1.2;
    modifiers.appliedRules.push("anticoagulant_bleeding_risk");
  }

  if (context.allergies && context.allergies.length > 0) {
    modifiers.allergyAlert = true;
    modifiers.appliedRules.push("allergy_screening_active");
  }

  if (context.smokingStatus === "current") {
    modifiers.smokingRisk = true;
    modifiers.riskMultiplier *= 1.15;
    modifiers.appliedRules.push("smoking_risk_adjustment");
  }

  if (context.weight != null && context.weight > 120) {
    modifiers.obesityRisk = true;
    modifiers.riskMultiplier *= 1.1;
    modifiers.appliedRules.push("obesity_risk_adjustment");
  }

  modifiers.riskMultiplier = Math.round(modifiers.riskMultiplier * 100) / 100;
  return modifiers;
}
