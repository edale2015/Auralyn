export interface PregnancySafetyInput {
  medications: string[];
  gestationalWeekEstimate?: number;
  complaint?: string;
  trimester?: 1 | 2 | 3;
  isBreastfeeding?: boolean;
}

export type FDAPregnancyCategory = "A" | "B" | "C" | "D" | "X" | "Unknown";

export interface MedicationPregnancyProfile {
  drug: string;
  category: FDAPregnancyCategory;
  risk: "safe" | "caution" | "avoid" | "contraindicated";
  trimesterNotes: {
    first?: string;
    second?: string;
    third?: string;
  };
  breastfeedingRisk: "compatible" | "caution" | "avoid" | "unknown";
  recommendation: string;
}

export interface PregnancySafetyResult {
  safe: boolean;
  profiles: MedicationPregnancyProfile[];
  contraindicatedDrugs: string[];
  requiresObstetricReview: boolean;
  recommendation: string;
  emergencyFlags: string[];
}

const PREGNANCY_DB: MedicationPregnancyProfile[] = [
  {
    drug: "aspirin",
    category: "D",
    risk: "avoid",
    trimesterNotes: {
      first: "Risk of gastroschisis and cardiac malformations at full doses",
      second: "Low-dose (81mg) used for pre-eclampsia prophylaxis under physician guidance",
      third: "Full-dose contraindicated: premature closure of ductus arteriosus, PPH risk"
    },
    breastfeedingRisk: "caution",
    recommendation: "Avoid full-dose aspirin throughout pregnancy. Low-dose only under OB guidance."
  },
  {
    drug: "ibuprofen",
    category: "D",
    risk: "contraindicated",
    trimesterNotes: {
      first: "Possible increased miscarriage risk; cardiac defects reported",
      second: "Avoid; linked to oligohydramnios",
      third: "Contraindicated: premature ductus arteriosus closure, fetal renal impairment"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Contraindicated in pregnancy especially after 20 weeks. Use acetaminophen instead."
  },
  {
    drug: "acetaminophen",
    category: "B",
    risk: "caution",
    trimesterNotes: {
      first: "Generally safe at therapeutic doses",
      second: "Safe at recommended doses; avoid prolonged high-dose use",
      third: "Safe; preferred analgesic/antipyretic in pregnancy"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Preferred analgesic in pregnancy. Use lowest effective dose for shortest duration."
  },
  {
    drug: "amoxicillin",
    category: "B",
    risk: "safe",
    trimesterNotes: {
      first: "Safe; commonly used for bacterial infections",
      second: "Safe",
      third: "Safe"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Safe antibiotic choice throughout pregnancy."
  },
  {
    drug: "azithromycin",
    category: "B",
    risk: "safe",
    trimesterNotes: {
      first: "Safe for respiratory infections, STIs",
      second: "Safe",
      third: "Safe"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Generally safe; preferred macrolide in pregnancy."
  },
  {
    drug: "tetracycline",
    category: "D",
    risk: "contraindicated",
    trimesterNotes: {
      second: "Dental discoloration and enamel hypoplasia in fetus",
      third: "Hepatotoxicity in mother; permanent staining of fetal teeth and bones"
    },
    breastfeedingRisk: "avoid",
    recommendation: "Contraindicated after first trimester. Use amoxicillin or azithromycin."
  },
  {
    drug: "doxycycline",
    category: "D",
    risk: "contraindicated",
    trimesterNotes: {
      first: "Avoid; teratogenic risk",
      second: "Contraindicated: dental staining, enamel defects",
      third: "Contraindicated"
    },
    breastfeedingRisk: "avoid",
    recommendation: "Contraindicated in pregnancy. Use alternative antibiotic class."
  },
  {
    drug: "warfarin",
    category: "X",
    risk: "contraindicated",
    trimesterNotes: {
      first: "Warfarin embryopathy: nasal hypoplasia, stippled epiphyses, growth restriction",
      second: "CNS abnormalities: optic atrophy, microcephaly",
      third: "Fetal hemorrhage risk; avoid near term"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Contraindicated especially in first trimester. Switch to low-molecular-weight heparin."
  },
  {
    drug: "metformin",
    category: "B",
    risk: "safe",
    trimesterNotes: {
      first: "Used for PCOS; may reduce miscarriage risk in some populations",
      second: "Safe; used for gestational diabetes",
      third: "Safe; monitor for neonatal hypoglycemia"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Acceptable for gestational diabetes management under physician supervision."
  },
  {
    drug: "insulin",
    category: "B",
    risk: "safe",
    trimesterNotes: {
      first: "Safe; does not cross placenta",
      second: "Safe; preferred for GDM",
      third: "Safe; dose adjustment needed at term"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Preferred agent for diabetes management in pregnancy."
  },
  {
    drug: "lisinopril",
    category: "D",
    risk: "contraindicated",
    trimesterNotes: {
      first: "Use in first trimester associated with cardiac malformations",
      second: "Contraindicated: oligohydramnios, fetal renal failure",
      third: "Contraindicated: neonatal anuria, limb contractures, pulmonary hypoplasia"
    },
    breastfeedingRisk: "caution",
    recommendation: "Contraindicated in pregnancy. Switch to methyldopa, labetalol, or nifedipine for hypertension."
  },
  {
    drug: "enalapril",
    category: "D",
    risk: "contraindicated",
    trimesterNotes: {
      second: "Fetopathy: renal tubular dysgenesis, oligohydramnios",
      third: "Severe neonatal renal failure, skull ossification defects"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Contraindicated in second and third trimesters. Use labetalol or methyldopa."
  },
  {
    drug: "fluconazole",
    category: "D",
    risk: "avoid",
    trimesterNotes: {
      first: "High doses (≥400mg) linked to cardiac defects; single low dose (150mg) lower risk",
      second: "Avoid prolonged use",
      third: "Avoid"
    },
    breastfeedingRisk: "caution",
    recommendation: "Single-dose oral treatment for vaginal candidiasis should be discussed with OB. Topical antifungals preferred."
  },
  {
    drug: "metronidazole",
    category: "B",
    risk: "caution",
    trimesterNotes: {
      first: "Avoid high-dose IV regimens in first trimester; standard oral doses studied extensively",
      second: "Safe for BV and trichomoniasis",
      third: "Safe"
    },
    breastfeedingRisk: "caution",
    recommendation: "Acceptable after first trimester for anaerobic infections and BV. Single high doses: avoid while breastfeeding."
  },
  {
    drug: "isotretinoin",
    category: "X",
    risk: "contraindicated",
    trimesterNotes: {
      first: "Severe teratogen: CNS, cardiac, facial malformations (craniofacial, ear defects)",
      second: "Contraindicated",
      third: "Contraindicated"
    },
    breastfeedingRisk: "avoid",
    recommendation: "Absolutely contraindicated in pregnancy. Mandatory contraception program (iPLEDGE) required."
  },
  {
    drug: "ssri",
    category: "C",
    risk: "caution",
    trimesterNotes: {
      first: "Small risk of cardiac septal defects with paroxetine; other SSRIs lower risk",
      second: "Generally acceptable when benefit outweighs risk",
      third: "Neonatal adaptation syndrome; persistent pulmonary hypertension (rare)"
    },
    breastfeedingRisk: "caution",
    recommendation: "Continue if severe depression; use lowest effective dose. Discuss risks/benefits with OB and psychiatry."
  },
  {
    drug: "folic acid",
    category: "A",
    risk: "safe",
    trimesterNotes: {
      first: "Essential: 400-800mcg daily reduces neural tube defect risk by 70%",
      second: "Continue throughout pregnancy",
      third: "Continue"
    },
    breastfeedingRisk: "compatible",
    recommendation: "Strongly recommended throughout pregnancy, especially the first trimester."
  }
];

function normalizeDrug(drug: string): string {
  return drug.toLowerCase().trim();
}

export function checkPregnancySafety(input: PregnancySafetyInput): PregnancySafetyResult {
  const meds = input.medications.map(normalizeDrug);
  const trimester = input.trimester ?? (
    input.gestationalWeekEstimate
      ? input.gestationalWeekEstimate <= 12 ? 1 : input.gestationalWeekEstimate <= 27 ? 2 : 3
      : undefined
  );

  const profiles: MedicationPregnancyProfile[] = [];
  const contraindicatedDrugs: string[] = [];
  const emergencyFlags: string[] = [];

  for (const med of meds) {
    const match = PREGNANCY_DB.find(p =>
      med.includes(p.drug) || p.drug.includes(med)
    );
    if (match) {
      profiles.push(match);
      if (match.risk === "contraindicated" || match.category === "X") {
        contraindicatedDrugs.push(match.drug);
        if (match.category === "X") {
          emergencyFlags.push(`TERATOGEN ALERT: ${match.drug} is FDA Category X — absolutely contraindicated in pregnancy.`);
        }
      }
    }
  }

  const requiresOB = contraindicatedDrugs.length > 0 ||
    profiles.some(p => p.category === "D" || p.category === "X") ||
    (input.isBreastfeeding && profiles.some(p => p.breastfeedingRisk === "avoid"));

  let recommendation = "No significant pregnancy safety concerns identified for listed medications.";

  if (contraindicatedDrugs.length > 0) {
    recommendation = `IMMEDIATE OB REVIEW REQUIRED: Contraindicated drug(s) detected: ${contraindicatedDrugs.join(", ")}. Do not administer without physician authorisation.`;
  } else if (profiles.some(p => p.risk === "avoid")) {
    recommendation = "Medications flagged to avoid in pregnancy are present. Consult OB for safer alternatives.";
  } else if (profiles.some(p => p.risk === "caution")) {
    recommendation = "Medications requiring caution in pregnancy detected. Discuss risk-benefit ratio with OB.";
  }

  if (input.isBreastfeeding) {
    const bfAvoid = profiles.filter(p => p.breastfeedingRisk === "avoid").map(p => p.drug);
    if (bfAvoid.length > 0) {
      recommendation += ` BREASTFEEDING: Avoid ${bfAvoid.join(", ")} — advise to hold nursing or discard milk.`;
    }
  }

  return {
    safe: contraindicatedDrugs.length === 0 && profiles.every(p => p.risk === "safe" || p.risk === "caution"),
    profiles,
    contraindicatedDrugs,
    requiresObstetricReview: requiresOB,
    recommendation,
    emergencyFlags
  };
}

export function getPregnancyDrugDatabase(): MedicationPregnancyProfile[] {
  return PREGNANCY_DB;
}
