export interface MedicationOrder {
  medicationKey: string;
  class: string;
}

export interface MedicationGuardResult {
  allowed: boolean;
  reasons: string[];
}

const INCOMPATIBLE_SHOTGUN_SETS: string[][] = [
  [
    "empiric_azithromycin",
    "empiric_doxycycline",
    "empiric_ceftriaxone",
    "consider_targeted_antiviral",
    "paxlovid_like_order",
  ],
];

export function validateMedicationBundle(
  orders: MedicationOrder[]
): MedicationGuardResult {
  const keys = new Set(orders.map((o) => o.medicationKey));
  const reasons: string[] = [];

  for (const combo of INCOMPATIBLE_SHOTGUN_SETS) {
    const count = combo.filter((k) => keys.has(k)).length;
    if (count >= 3) {
      reasons.push(
        "Shotgun treatment pattern detected: multiple unrelated empiric therapies ordered for one presentation."
      );
    }
  }

  const antibioticCount = orders.filter((o) => o.class === "antibiotic").length;
  if (antibioticCount >= 2) {
    reasons.push("Multiple simultaneous antibiotics require explicit justification.");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
