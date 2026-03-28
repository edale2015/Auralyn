export interface FormularyResult {
  drug: string;
  covered: boolean;
  priorAuthRequired: boolean;
  preferredAlternative?: string;
  tier?: "preferred" | "non-preferred" | "specialty" | "restricted";
  notes?: string;
}

const formularyOverrides: Record<string, FormularyResult> = {
  xofluza: {
    drug: "xofluza",
    covered: false,
    priorAuthRequired: true,
    preferredAlternative: "oseltamivir",
    tier: "specialty",
    notes: "Baloxavir requires prior authorization — prefer oseltamivir for uncomplicated influenza",
  },
  "oseltamivir-iv": {
    drug: "oseltamivir-iv",
    covered: false,
    priorAuthRequired: true,
    tier: "specialty",
    notes: "IV oseltamivir restricted to inpatient use only",
  },
  adalimumab: {
    drug: "adalimumab",
    covered: true,
    priorAuthRequired: true,
    tier: "specialty",
    notes: "Biologic — step therapy required (conventional DMARD failure)",
  },
};

export async function checkFormulary(
  clinicId: string,
  payerId: string,
  drug: string
): Promise<FormularyResult> {
  const normalized = drug.toLowerCase().trim();
  if (formularyOverrides[normalized]) {
    return formularyOverrides[normalized];
  }
  return {
    drug,
    covered: true,
    priorAuthRequired: false,
    tier: "preferred",
  };
}

export function listFormularyOverrides(): FormularyResult[] {
  return Object.values(formularyOverrides);
}
