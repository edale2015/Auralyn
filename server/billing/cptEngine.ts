/**
 * CPT code generator from clinical workflow output.
 * Separate from the richer codingEngine.ts — this focuses on risk-level-driven E&M coding.
 */

export interface CPTResult {
  code:          string;
  level:         string;
  justification: string;
}

const CPT_MAP: Record<string, { code: string; level: string }> = {
  low:      { code: "99213", level: "Office visit — moderate complexity" },
  moderate: { code: "99214", level: "Office visit — high complexity" },
  high:     { code: "99214", level: "Office visit — high complexity" },
  critical: { code: "99285", level: "ED visit — high complexity (observation)" },
};

export function generateCPT(clinical: {
  riskLevel?:  string;
  diagnosis?:  string;
  disposition?: string;
}): CPTResult {
  const level = clinical.riskLevel ?? "low";
  const entry = CPT_MAP[level] ?? CPT_MAP.low;

  return {
    code:          entry.code,
    level:         entry.level,
    justification: `Risk level: ${level} | Diagnosis: ${clinical.diagnosis ?? "Unknown"} | Disposition: ${clinical.disposition ?? "Unknown"}`,
  };
}

// ── Token-based multi-code CPT generation (spec: cptEngine v2) ──────────────

export interface TokenCPTResult {
  codes:         string[];
  primary:       string;
  addOns:        string[];
  justification: string;
}

const ADDON_MAP: Record<string, string> = {
  strep:    "87880",  // rapid strep
  covid:    "87635",  // COVID PCR
  flu:      "87804",  // influenza rapid
  uti:      "81001",  // urinalysis
  chest_xr: "71046",  // chest X-ray 2-view
  ekg:      "93000",  // ECG
  troponin: "84484",  // troponin
};

export function generateCPTFromTokens(tokens: {
  riskLevel?:       string;
  allowedDiagnoses?: string[];
  disposition?:      string;
}): TokenCPTResult {
  const riskLevel   = tokens.riskLevel ?? "low";
  const diagnoses   = tokens.allowedDiagnoses ?? [];

  // Primary E/M code
  const emMap: Record<string, string> = {
    low:      "99213",
    moderate: "99214",
    high:     "99215",
    critical: "99285",
  };
  const primary = emMap[riskLevel] ?? "99213";

  // Add-on procedure codes based on diagnosis list
  const addOns: string[] = [];
  for (const dx of diagnoses) {
    const dxLower = dx.toLowerCase();
    for (const [key, code] of Object.entries(ADDON_MAP)) {
      if (dxLower.includes(key) && !addOns.includes(code)) {
        addOns.push(code);
      }
    }
  }
  // ACS workup add-ons
  if (diagnoses.some((d) => ["acs", "mi", "chest"].some((k) => d.toLowerCase().includes(k)))) {
    if (!addOns.includes("93000")) addOns.push("93000");
    if (!addOns.includes("84484")) addOns.push("84484");
  }

  const codes = [primary, ...addOns];

  return {
    codes,
    primary,
    addOns,
    justification: `Risk: ${riskLevel}, Diagnoses: ${diagnoses.join(",") || "none"}`,
  };
}
