import { ClinicalPopulationFlags } from "../db/sharedTypes";

export interface ClinicalStateLike {
  ageYears?: number | null;
  pregnant?: boolean | null;
  immunocompromised?: boolean | null;
  dialysisDependent?: boolean | null;
  conditions?: string[] | null;
  medications?: string[] | null;
}

const IMMUNOCOMPROMISED_CONDITIONS = new Set([
  'hiv', 'aids', 'transplant', 'neutropenia', 'active cancer',
  'lymphoma', 'leukemia', 'myeloma', 'chemotherapy', 'immunosuppressed',
]);

const IMMUNOCOMPROMISED_MEDS = new Set([
  'tacrolimus', 'mycophenolate', 'prednisone', 'chemotherapy',
  'rituximab', 'methotrexate', 'cyclosporine', 'azathioprine',
]);

const DIALYSIS_CONDITIONS = new Set([
  'dialysis', 'hemodialysis', 'peritoneal dialysis', 'esrd', 'end stage renal',
]);

export function buildPopulationFlags(state: ClinicalStateLike): ClinicalPopulationFlags {
  const conditions = new Set((state.conditions ?? []).map(x => x.toLowerCase()));
  const meds = new Set((state.medications ?? []).map(x => x.toLowerCase()));

  const immunocompromised =
    Boolean(state.immunocompromised) ||
    [...conditions].some(c => [...IMMUNOCOMPROMISED_CONDITIONS].some(ic => c.includes(ic))) ||
    [...meds].some(m => [...IMMUNOCOMPROMISED_MEDS].some(im => m.includes(im)));

  const dialysisDependent =
    Boolean(state.dialysisDependent) ||
    [...conditions].some(c => [...DIALYSIS_CONDITIONS].some(dc => c.includes(dc)));

  return {
    immunocompromised,
    elderlyOver75: (state.ageYears ?? 0) >= 75,
    pregnant: Boolean(state.pregnant),
    pediatricUnder2: (state.ageYears ?? 999) < 2,
    dialysisDependent,
  };
}

export function hasAnyFlag(flags: ClinicalPopulationFlags): boolean {
  return Object.values(flags).some(Boolean);
}
