export interface PediatricSafetyInput {
  medications: Array<{
    name: string;
    dose?: number;
    unit?: string;
    frequency?: string;
  }>;
  ageYears: number;
  ageMonths?: number;
  weightKg?: number;
  complaint?: string;
}

export interface PediatricDoseCheck {
  drug: string;
  providedDose?: number;
  minSafeDoseMgKg?: number;
  maxSafeDoseMgKg?: number;
  calculatedMinDose?: number;
  calculatedMaxDose?: number;
  maxAbsoluteDoseMg?: number;
  status: "safe" | "underdose" | "overdose" | "age_restricted" | "contraindicated" | "verify";
  alert?: string;
  recommendation: string;
}

export interface PediatricSafetyResult {
  safe: boolean;
  ageGroupLabel: string;
  doseChecks: PediatricDoseCheck[];
  contraindicatedDrugs: string[];
  requiresPediatricReview: boolean;
  recommendation: string;
  emergencyFlags: string[];
}

interface PediatricDrugProfile {
  drug: string;
  minAgeDays?: number;
  minAgeMonths?: number;
  contraindicatedUnderAgeYears?: number;
  doseMgPerKg?: { min: number; max: number };
  maxAbsoluteDoseMg?: number;
  notes: string;
  warnings?: string[];
}

const PEDIATRIC_DB: PediatricDrugProfile[] = [
  {
    drug: "aspirin",
    contraindicatedUnderAgeYears: 16,
    notes: "Risk of Reye syndrome in children with viral illness — absolute contraindication under 16",
    warnings: ["REYE SYNDROME RISK: Never give aspirin to children/teens with fever from viral infection"]
  },
  {
    drug: "ibuprofen",
    minAgeMonths: 3,
    doseMgPerKg: { min: 5, max: 10 },
    maxAbsoluteDoseMg: 400,
    notes: "Not recommended under 3 months. Maximum 40mg/kg/day",
    warnings: ["Under 6 months: use with caution and only under physician guidance"]
  },
  {
    drug: "acetaminophen",
    minAgeMonths: 0,
    doseMgPerKg: { min: 10, max: 15 },
    maxAbsoluteDoseMg: 1000,
    notes: "Safe from birth at correct weight-based dosing. Max 75mg/kg/day (not to exceed 4g/day)",
    warnings: []
  },
  {
    drug: "amoxicillin",
    minAgeMonths: 0,
    doseMgPerKg: { min: 25, max: 45 },
    maxAbsoluteDoseMg: 500,
    notes: "Standard paediatric antibiotic. For AOM high-dose: 80-90 mg/kg/day",
    warnings: []
  },
  {
    drug: "azithromycin",
    minAgeMonths: 6,
    doseMgPerKg: { min: 5, max: 12 },
    maxAbsoluteDoseMg: 500,
    notes: "Cardiac risk (QT prolongation) — use with caution. Day 1: 10mg/kg, Day 2-5: 5mg/kg",
    warnings: ["QT prolongation risk; avoid in patients with cardiac arrhythmia history"]
  },
  {
    drug: "codeine",
    contraindicatedUnderAgeYears: 12,
    notes: "FDA black box: contraindicated under 12 years; ultra-rapid metabolisers risk fatal respiratory depression",
    warnings: ["FDA BLACK BOX: Do NOT use codeine in children under 12 years"]
  },
  {
    drug: "tramadol",
    contraindicatedUnderAgeYears: 12,
    notes: "Contraindicated under 12 — respiratory depression risk. Avoid under 18 post-tonsillectomy/adenoidectomy",
    warnings: ["FDA BLACK BOX: Contraindicated in children under 12"]
  },
  {
    drug: "metoclopramide",
    contraindicatedUnderAgeYears: 1,
    doseMgPerKg: { min: 0.1, max: 0.15 },
    maxAbsoluteDoseMg: 10,
    notes: "Risk of extrapyramidal reactions. Avoid under 1 year. Not recommended under 2 years",
    warnings: ["Extrapyramidal reactions; limit to short-term use"]
  },
  {
    drug: "loratadine",
    minAgeMonths: 24,
    doseMgPerKg: { min: 0.2, max: 0.2 },
    maxAbsoluteDoseMg: 10,
    notes: "Under 2 years: use only under physician guidance. Age 2-5: 5mg, age >6: 10mg",
    warnings: []
  },
  {
    drug: "cetirizine",
    minAgeMonths: 6,
    doseMgPerKg: { min: 0.25, max: 0.25 },
    maxAbsoluteDoseMg: 10,
    notes: "6 months to 2 years: 2.5mg/day. 2-5 years: 2.5mg twice daily. >6 years: 10mg/day",
    warnings: []
  },
  {
    drug: "prednisone",
    minAgeMonths: 0,
    doseMgPerKg: { min: 0.5, max: 2 },
    maxAbsoluteDoseMg: 60,
    notes: "Anti-inflammatory: 0.5-1mg/kg/day; immunosuppressive: 1-2mg/kg/day. Taper doses over 1 week",
    warnings: ["Prolonged use: growth suppression, adrenal suppression, osteoporosis risk"]
  },
  {
    drug: "metformin",
    minAgeMonths: 120,
    notes: "Approved for type 2 diabetes in children 10+ years only",
    warnings: ["Do not use under 10 years; renal function must be normal"]
  },
  {
    drug: "ciprofloxacin",
    notes: "Generally avoided in children due to cartilage toxicity risk; use only when no alternative",
    warnings: ["Reserve for life-threatening infections when no safe alternative; monitor musculoskeletal function"]
  },
  {
    drug: "tetracycline",
    contraindicatedUnderAgeYears: 8,
    notes: "Tooth discoloration and enamel hypoplasia — contraindicated under 8 years",
    warnings: ["Permanent dental staining if used under 8 years"]
  },
  {
    drug: "promethazine",
    contraindicatedUnderAgeYears: 2,
    notes: "FDA black box: risk of fatal respiratory depression in under-2 years",
    warnings: ["FDA BLACK BOX: Do NOT use in children under 2 years — fatal respiratory depression risk"]
  },
  {
    drug: "pseudoephedrine",
    contraindicatedUnderAgeYears: 4,
    notes: "OTC cold medicines with pseudoephedrine/decongestants not recommended under 4 years (FDA)",
    warnings: ["Not recommended under 4 years; overdose risk; FDA advisory"]
  },
  {
    drug: "salicylate",
    contraindicatedUnderAgeYears: 16,
    notes: "All salicylates risk Reye syndrome",
    warnings: ["REYE SYNDROME RISK: Avoid all salicylates under 16 years in viral illness"]
  }
];

function getAgeGroupLabel(ageYears: number, ageMonths = 0): string {
  const totalMonths = ageYears * 12 + ageMonths;
  if (totalMonths < 1) return "Neonate (<1 month)";
  if (totalMonths < 3) return "Young Infant (1-3 months)";
  if (totalMonths < 12) return "Infant (3-12 months)";
  if (ageYears < 2) return "Toddler (1-2 years)";
  if (ageYears < 5) return "Preschool (2-5 years)";
  if (ageYears < 12) return "School Age (5-12 years)";
  if (ageYears < 18) return "Adolescent (12-18 years)";
  return "Adult (18+)";
}

export function checkPediatricSafety(input: PediatricSafetyInput): PediatricSafetyResult {
  const totalAgeMonths = input.ageYears * 12 + (input.ageMonths || 0);
  const ageGroupLabel = getAgeGroupLabel(input.ageYears, input.ageMonths);
  const doseChecks: PediatricDoseCheck[] = [];
  const contraindicatedDrugs: string[] = [];
  const emergencyFlags: string[] = [];

  for (const medInput of input.medications) {
    const name = medInput.name.toLowerCase().trim();
    const profile = PEDIATRIC_DB.find(p => name.includes(p.drug) || p.drug.includes(name));

    if (!profile) {
      doseChecks.push({
        drug: medInput.name,
        status: "verify",
        recommendation: `No paediatric data found for "${medInput.name}". Verify against BNFc or local formulary.`
      });
      continue;
    }

    const minAgeMonthsRequired = profile.minAgeMonths ?? (profile.minAgeDays ? Math.ceil(profile.minAgeDays / 30) : 0);
    const contraindicatedUnderMonths = profile.contraindicatedUnderAgeYears
      ? profile.contraindicatedUnderAgeYears * 12
      : null;

    if (contraindicatedUnderMonths !== null && totalAgeMonths < contraindicatedUnderMonths) {
      contraindicatedDrugs.push(profile.drug);
      const flags = profile.warnings || [];
      flags.forEach(f => emergencyFlags.push(f));
      doseChecks.push({
        drug: medInput.name,
        status: "contraindicated",
        alert: `Contraindicated under ${profile.contraindicatedUnderAgeYears} years`,
        recommendation: profile.notes
      });
      continue;
    }

    if (totalAgeMonths < minAgeMonthsRequired) {
      doseChecks.push({
        drug: medInput.name,
        status: "age_restricted",
        alert: `Not recommended under ${minAgeMonthsRequired} months (patient is ${totalAgeMonths} months)`,
        recommendation: profile.notes
      });
      if (profile.warnings) profile.warnings.forEach(w => emergencyFlags.push(w));
      continue;
    }

    let check: PediatricDoseCheck = {
      drug: medInput.name,
      status: "safe",
      recommendation: profile.notes
    };

    if (profile.doseMgPerKg && input.weightKg && medInput.dose) {
      const minDose = profile.doseMgPerKg.min * input.weightKg;
      const maxDose = Math.min(
        profile.doseMgPerKg.max * input.weightKg,
        profile.maxAbsoluteDoseMg ?? Infinity
      );
      check.minSafeDoseMgKg = profile.doseMgPerKg.min;
      check.maxSafeDoseMgKg = profile.doseMgPerKg.max;
      check.calculatedMinDose = Math.round(minDose * 10) / 10;
      check.calculatedMaxDose = Math.round(maxDose * 10) / 10;
      check.maxAbsoluteDoseMg = profile.maxAbsoluteDoseMg;
      check.providedDose = medInput.dose;

      if (medInput.dose < minDose * 0.8) {
        check.status = "underdose";
        check.alert = `Dose ${medInput.dose}mg is below minimum (${check.calculatedMinDose}mg for ${input.weightKg}kg patient)`;
        check.recommendation = `Increase dose to ${check.calculatedMinDose}–${check.calculatedMaxDose}mg. ${profile.notes}`;
      } else if (medInput.dose > (profile.maxAbsoluteDoseMg ?? maxDose) || medInput.dose > maxDose * 1.1) {
        check.status = "overdose";
        check.alert = `DOSE ALERT: ${medInput.dose}mg exceeds maximum (${check.calculatedMaxDose}mg for this patient)`;
        check.recommendation = `Reduce dose to maximum ${check.calculatedMaxDose}mg. ${profile.notes}`;
        emergencyFlags.push(`OVERDOSE RISK: ${medInput.name} dose (${medInput.dose}mg) exceeds safe maximum for ${input.weightKg}kg child`);
      }
    } else if (profile.doseMgPerKg && !input.weightKg) {
      check.status = "verify";
      check.recommendation = `Weight required for dose calculation. Safe range: ${profile.doseMgPerKg.min}–${profile.doseMgPerKg.max} mg/kg. ${profile.notes}`;
    }

    if (profile.warnings) profile.warnings.forEach(w => emergencyFlags.push(w));
    doseChecks.push(check);
  }

  const hasOverdose = doseChecks.some(d => d.status === "overdose");
  const hasContraindicated = contraindicatedDrugs.length > 0;
  const requiresReview = hasOverdose || hasContraindicated ||
    doseChecks.some(d => d.status === "age_restricted" || d.status === "underdose");

  let recommendation = "All medications appear appropriate for this paediatric patient.";
  if (hasContraindicated) {
    recommendation = `CONTRAINDICATED MEDICATION(S) for ${ageGroupLabel}: ${contraindicatedDrugs.join(", ")}. Paediatric physician review required immediately.`;
  } else if (hasOverdose) {
    recommendation = "OVERDOSE RISK DETECTED. Verify and reduce doses before administration. Paediatric review required.";
  } else if (doseChecks.some(d => d.status === "age_restricted")) {
    recommendation = "Age-restricted medications present. Verify appropriateness with paediatric pharmacist.";
  }

  return {
    safe: !hasContraindicated && !hasOverdose && doseChecks.every(d => d.status === "safe" || d.status === "verify"),
    ageGroupLabel,
    doseChecks,
    contraindicatedDrugs,
    requiresPediatricReview: requiresReview,
    recommendation,
    emergencyFlags: [...new Set(emergencyFlags)]
  };
}

export function getPediatricAgeGroups(): string[] {
  return [
    "Neonate (<1 month)",
    "Young Infant (1-3 months)",
    "Infant (3-12 months)",
    "Toddler (1-2 years)",
    "Preschool (2-5 years)",
    "School Age (5-12 years)",
    "Adolescent (12-18 years)"
  ];
}
