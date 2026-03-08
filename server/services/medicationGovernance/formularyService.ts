export interface FormularyEntry {
  medicationId: string;
  name: string;
  category: string;
  tier: "preferred" | "non-preferred" | "specialty" | "restricted";
  requiresPriorAuth: boolean;
  restrictions?: string[];
}

const formulary: FormularyEntry[] = [
  { medicationId: "amoxicillin", name: "Amoxicillin", category: "antibiotics", tier: "preferred", requiresPriorAuth: false },
  { medicationId: "azithromycin", name: "Azithromycin", category: "antibiotics", tier: "preferred", requiresPriorAuth: false },
  { medicationId: "oseltamivir", name: "Oseltamivir (Tamiflu)", category: "antivirals", tier: "preferred", requiresPriorAuth: false },
  { medicationId: "prednisone", name: "Prednisone", category: "corticosteroids", tier: "preferred", requiresPriorAuth: false },
  { medicationId: "benzonatate", name: "Benzonatate", category: "antitussives", tier: "non-preferred", requiresPriorAuth: false },
  { medicationId: "codeine", name: "Codeine", category: "opioids", tier: "restricted", requiresPriorAuth: true, restrictions: ["Max 3-day supply", "Requires documented severe cough"] },
];

export function listFormulary(): FormularyEntry[] { return [...formulary]; }
export function getFormularyEntry(medicationId: string): FormularyEntry | undefined { return formulary.find((f) => f.medicationId === medicationId); }
export function searchFormulary(query: string): FormularyEntry[] {
  const q = query.toLowerCase();
  return formulary.filter((f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
}
