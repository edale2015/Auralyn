export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: "minor" | "moderate" | "major" | "contraindicated";
  description: string;
}

const KNOWN_INTERACTIONS: DrugInteraction[] = [
  { drug1: "warfarin", drug2: "aspirin", severity: "major", description: "Increased bleeding risk" },
  { drug1: "metformin", drug2: "contrast_dye", severity: "major", description: "Risk of lactic acidosis" },
  { drug1: "ssri", drug2: "maoi", severity: "contraindicated", description: "Serotonin syndrome risk" },
  { drug1: "ace_inhibitor", drug2: "potassium", severity: "moderate", description: "Hyperkalemia risk" },
  { drug1: "statin", drug2: "macrolide", severity: "moderate", description: "Increased myopathy risk" },
];

export function checkDrugInteractions(currentMedications: string[], proposedMedication: string): DrugInteraction[] {
  const proposed = proposedMedication.toLowerCase();
  const current = currentMedications.map((m) => m.toLowerCase());

  return KNOWN_INTERACTIONS.filter((i) => {
    const d1 = i.drug1.toLowerCase();
    const d2 = i.drug2.toLowerCase();
    return (
      (current.some((m) => m.includes(d1)) && proposed.includes(d2)) ||
      (current.some((m) => m.includes(d2)) && proposed.includes(d1))
    );
  });
}
