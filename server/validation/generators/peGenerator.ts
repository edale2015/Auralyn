/**
 * server/validation/generators/peGenerator.ts
 * Gold-standard synthetic case generator for Pulmonary Embolism (PE).
 *
 * Cases are structurally realistic representations of PE presentations.
 * All generated cases expect ED disposition — any lower acuity output
 * from the triage engine on these cases is an unsafe undercall.
 */

export type GeneratedCase = {
  id:                     string;
  complaint:              string;
  observations:           Array<{ feature: string; value: boolean | number | string }>;
  expectedDisposition:    "ed" | "urgent_care" | "home";
  minimumSafeDisposition: "ed" | "urgent_care" | "home";
  redFlagCount:           number;
  clinicalNotes?:         string;
};

export function generatePECases(n = 100): GeneratedCase[] {
  const cases: GeneratedCase[] = [];

  for (let i = 0; i < n; i++) {
    const hasTachycardia       = Math.random() > 0.3;
    const hasPleuriticPain     = Math.random() > 0.5;
    const hasHemoptysis        = Math.random() > 0.7;
    const hasLegSwelling       = Math.random() > 0.5;
    const hasRecentSurgery     = Math.random() > 0.6;
    const hasLowO2             = Math.random() > 0.4;

    const redFlagCount = [hasTachycardia, hasHemoptysis, hasLowO2].filter(Boolean).length + 1; // SOB always

    cases.push({
      id:        `pe_${i}`,
      complaint: "sob",
      observations: [
        { feature: "sob",                value: true },
        { feature: "tachycardia",        value: hasTachycardia },
        { feature: "pleuritic_chest_pain", value: hasPleuriticPain },
        { feature: "hemoptysis",         value: hasHemoptysis },
        { feature: "unilateral_leg_swelling", value: hasLegSwelling },
        { feature: "recent_surgery_or_immobility", value: hasRecentSurgery },
        { feature: "low_o2_saturation", value: hasLowO2 },
      ],
      expectedDisposition:    "ed",
      minimumSafeDisposition: "ed",
      redFlagCount,
      clinicalNotes: "PE must always be worked up in ED. No safe home pathway for suspected PE.",
    });
  }

  return cases;
}
