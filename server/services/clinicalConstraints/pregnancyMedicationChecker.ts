export interface PregnancySafetyResult {
  medication: string;
  category: "A" | "B" | "C" | "D" | "X" | "unknown";
  safe: boolean;
  warning?: string;
}

const PREGNANCY_CATEGORIES: Record<string, "A" | "B" | "C" | "D" | "X"> = {
  acetaminophen: "B",
  ibuprofen: "D",
  aspirin: "D",
  metformin: "B",
  warfarin: "X",
  isotretinoin: "X",
  amoxicillin: "B",
  doxycycline: "D",
  lisinopril: "D",
  methotrexate: "X",
};

export function checkPregnancySafety(medication: string): PregnancySafetyResult {
  const cat = PREGNANCY_CATEGORIES[medication.toLowerCase()];

  if (!cat) {
    return { medication, category: "unknown", safe: false, warning: "Pregnancy safety category unknown — verify before prescribing" };
  }

  const safe = cat === "A" || cat === "B";
  const warning = cat === "X" ? "Contraindicated in pregnancy" : cat === "D" ? "Positive evidence of risk — use only if benefit outweighs risk" : cat === "C" ? "Risk cannot be ruled out" : undefined;

  return { medication, category: cat, safe, warning };
}
