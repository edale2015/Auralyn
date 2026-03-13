export interface MedicationAlert {
  severity: "critical" | "major" | "moderate" | "minor";
  type: "allergy" | "interaction" | "contraindication" | "renal" | "hepatic" | "pregnancy";
  medication: string;
  concern: string;
  recommendation: string;
}

const ALLERGY_CROSS_REACTIONS: Record<string, string[]> = {
  penicillin: ["amoxicillin", "amoxicillin-clavulanate", "ampicillin", "piperacillin", "nafcillin"],
  sulfa: ["tmp-smx", "trimethoprim-sulfamethoxazole", "bactrim", "septra", "dapsone"],
  fluoroquinolone: ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin"],
  macrolide: ["azithromycin", "clarithromycin", "erythromycin"],
  nsaid: ["ibuprofen", "naproxen", "ketorolac", "aspirin", "celecoxib"],
  cephalosporin: ["cephalexin", "cefdinir", "cefuroxime", "ceftriaxone"],
};

const PREGNANCY_AVOID: string[] = [
  "ibuprofen", "naproxen", "aspirin", "doxycycline", "tetracycline",
  "tmp-smx", "trimethoprim", "ciprofloxacin", "levofloxacin", "metronidazole",
  "promethazine", "oxymetazoline", "pseudoephedrine",
];

const PREGNANCY_SAFE: string[] = [
  "acetaminophen", "amoxicillin", "cephalexin", "azithromycin",
  "nitrofurantoin", "ondansetron",
];

const RENAL_AVOID: string[] = [
  "nitrofurantoin", "nsaid", "ibuprofen", "naproxen",
  "tmp-smx", "metformin", "gabapentin",
];

const DRUG_INTERACTIONS: Array<{
  drug1: string;
  drug2: string;
  severity: MedicationAlert["severity"];
  effect: string;
}> = [
  { drug1: "warfarin", drug2: "aspirin", severity: "major", effect: "Increased bleeding risk — dual antithrombotic effect" },
  { drug1: "warfarin", drug2: "ibuprofen", severity: "major", effect: "Increased INR — NSAIDs displace warfarin and inhibit platelet aggregation" },
  { drug1: "warfarin", drug2: "azithromycin", severity: "major", effect: "Azithromycin inhibits CYP3A4 — may significantly increase INR" },
  { drug1: "maoi", drug2: "dextromethorphan", severity: "critical", effect: "Serotonin syndrome — potentially life-threatening" },
  { drug1: "ssri", drug2: "tramadol", severity: "major", effect: "Serotonin syndrome risk" },
  { drug1: "eliquis", drug2: "aspirin", severity: "major", effect: "Major bleeding risk — dual anticoagulation" },
  { drug1: "xarelto", drug2: "ibuprofen", severity: "major", effect: "Increased bleeding risk" },
  { drug1: "methotrexate", drug2: "tmp-smx", severity: "critical", effect: "Folate antagonism — severe pancytopenia risk" },
  { drug1: "nitrate", drug2: "sildenafil", severity: "critical", effect: "Severe hypotension — absolute contraindication" },
  { drug1: "nitrate", drug2: "tadalafil", severity: "critical", effect: "Severe hypotension — absolute contraindication" },
  { drug1: "ciprofloxacin", drug2: "antacid", severity: "moderate", effect: "Reduced ciprofloxacin absorption — separate by 2h" },
  { drug1: "digoxin", drug2: "azithromycin", severity: "major", effect: "Azithromycin may increase digoxin levels — toxicity risk" },
];

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
}

export function checkMedicationSafety(
  proposedMedications: string[],
  patientMedications: string[],
  allergies: string[],
  conditions: string[]
): MedicationAlert[] {
  const alerts: MedicationAlert[] = [];
  const allText = conditions.join(" ").toLowerCase();
  const isPregnant = allText.includes("pregnant") || allText.includes("pregnancy");
  const hasRenalDisease = allText.includes("ckd") || allText.includes("renal failure") || allText.includes("gfr < 45") || allText.includes("kidney disease");

  const normalizedAllergies = allergies.map(normalizeText);
  const normalizedPatientMeds = patientMedications.map(normalizeText);

  for (const proposed of proposedMedications) {
    const normProp = normalizeText(proposed);

    for (const allergy of normalizedAllergies) {
      const crossReacts = ALLERGY_CROSS_REACTIONS[allergy] ?? [];
      const isDirectAllergy = normProp.includes(allergy);
      const isCrossReact = crossReacts.some(cr => normProp.includes(normalizeText(cr)));
      if (isDirectAllergy || isCrossReact) {
        alerts.push({
          severity: "critical",
          type: "allergy",
          medication: proposed,
          concern: `${proposed} — ${isDirectAllergy ? "direct allergy" : `cross-reacts with ${allergy} allergy`}`,
          recommendation: `Do NOT prescribe ${proposed}. Select an alternative class.`,
        });
      }
    }

    if (isPregnant) {
      const avoidMatch = PREGNANCY_AVOID.some(d => normProp.includes(normalizeText(d)));
      if (avoidMatch) {
        alerts.push({
          severity: "major",
          type: "pregnancy",
          medication: proposed,
          concern: `${proposed} is generally avoided in pregnancy`,
          recommendation: "Consult OB or select a pregnancy-safe alternative (acetaminophen, amoxicillin, cephalexin).",
        });
      }
    }

    if (hasRenalDisease) {
      const renalMatch = RENAL_AVOID.some(d => normProp.includes(normalizeText(d)));
      if (renalMatch) {
        alerts.push({
          severity: "moderate",
          type: "renal",
          medication: proposed,
          concern: `${proposed} may accumulate in renal impairment`,
          recommendation: "Check eGFR before prescribing. Dose adjustment or alternative may be needed.",
        });
      }
    }

    for (const interaction of DRUG_INTERACTIONS) {
      const d1Match = normProp.includes(normalizeText(interaction.drug1)) || normalizedPatientMeds.some(pm => pm.includes(normalizeText(interaction.drug1)));
      const d2Match = normProp.includes(normalizeText(interaction.drug2)) || normalizedPatientMeds.some(pm => pm.includes(normalizeText(interaction.drug2)));
      if (d1Match && d2Match) {
        const other = d1Match && normProp.includes(normalizeText(interaction.drug1)) ? interaction.drug2 : interaction.drug1;
        alerts.push({
          severity: interaction.severity,
          type: "interaction",
          medication: proposed,
          concern: `Interaction: ${interaction.drug1} + ${interaction.drug2} — ${interaction.effect}`,
          recommendation: `Review combination carefully. Consider alternative if ${interaction.severity} risk.`,
        });
      }
    }
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, major: 1, moderate: 2, minor: 3 };
    return order[a.severity] - order[b.severity];
  });
}
