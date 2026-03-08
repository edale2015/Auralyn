export interface PatientProfile {
  age?: number;
  sex?: string;
  weight?: number;
  creatinine?: number;
  gfr?: number;
  altAst?: number;
  pregnant?: boolean;
  breastfeeding?: boolean;
  allergies?: string[];
  conditions?: string[];
  currentMedications?: string[];
}

export interface ConstraintResult {
  allowed: boolean;
  warnings: string[];
  contraindications: string[];
  adjustments: string[];
}

export function evaluatePatientConstraints(profile: PatientProfile, medicationId: string): ConstraintResult {
  const warnings: string[] = [];
  const contraindications: string[] = [];
  const adjustments: string[] = [];

  if (profile.age !== undefined && profile.age < 18) warnings.push("Pediatric patient — verify age-appropriate dosing");
  if (profile.age !== undefined && profile.age >= 65) warnings.push("Geriatric patient — consider dose reduction");
  if (profile.pregnant) contraindications.push("Pregnancy — verify medication safety category");
  if (profile.breastfeeding) warnings.push("Breastfeeding — check lactation safety");

  if (profile.gfr !== undefined && profile.gfr < 30) adjustments.push("Severe renal impairment — dose adjustment required");
  else if (profile.gfr !== undefined && profile.gfr < 60) adjustments.push("Moderate renal impairment — consider dose adjustment");

  if (profile.allergies?.length) warnings.push(`Known allergies: ${profile.allergies.join(", ")}`);

  return {
    allowed: contraindications.length === 0,
    warnings,
    contraindications,
    adjustments,
  };
}
