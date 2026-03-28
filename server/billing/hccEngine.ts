/**
 * HCC (Hierarchical Condition Category) Coding Engine
 *
 * Maps ICD-10-CM diagnoses to CMS-HCC risk adjustment model categories.
 * Used for:
 *   - Medicare Advantage risk score computation
 *   - Value-based contract risk stratification
 *   - Payor-specific claim optimization
 *
 * Reference: CMS-HCC Model V28 (2024) coefficient subset.
 */

export interface HccMatch {
  icd10:       string;
  hccCode:     string;
  hccLabel:    string;
  riskWeight:  number;
  category:    "cardiovascular" | "metabolic" | "respiratory" | "neurological" | "oncologic" | "infectious" | "other";
}

// Simplified CMS-HCC V28 mapping — representative subset
const HCC_MAP: Record<string, Omit<HccMatch, "icd10">> = {
  // ── Metabolic ──────────────────────────────────────────────────────────
  "E11":    { hccCode: "HCC37",  hccLabel: "Diabetes with Complications",           riskWeight: 0.318, category: "metabolic" },
  "E11.9":  { hccCode: "HCC19",  hccLabel: "Diabetes without Complications",         riskWeight: 0.118, category: "metabolic" },
  "E10":    { hccCode: "HCC37",  hccLabel: "Type 1 Diabetes with Complications",     riskWeight: 0.318, category: "metabolic" },
  "E78.5":  { hccCode: "HCC188", hccLabel: "Morbid Obesity",                         riskWeight: 0.273, category: "metabolic" },
  "E66.01": { hccCode: "HCC188", hccLabel: "Morbid Obesity (BMI ≥ 40)",              riskWeight: 0.273, category: "metabolic" },
  // ── Cardiovascular ────────────────────────────────────────────────────
  "I50":    { hccCode: "HCC85",  hccLabel: "Congestive Heart Failure",               riskWeight: 0.971, category: "cardiovascular" },
  "I21":    { hccCode: "HCC86",  hccLabel: "Acute Myocardial Infarction",            riskWeight: 0.548, category: "cardiovascular" },
  "I48":    { hccCode: "HCC96",  hccLabel: "Atrial Fibrillation",                   riskWeight: 0.270, category: "cardiovascular" },
  "I10":    { hccCode: "HCC120", hccLabel: "Hypertension with CKD",                  riskWeight: 0.140, category: "cardiovascular" },
  // ── Respiratory ───────────────────────────────────────────────────────
  "J44":    { hccCode: "HCC111", hccLabel: "COPD",                                   riskWeight: 0.335, category: "respiratory" },
  "J45":    { hccCode: "HCC110", hccLabel: "Asthma (severe)",                        riskWeight: 0.170, category: "respiratory" },
  "J18":    { hccCode: "HCC114", hccLabel: "Pneumonia",                              riskWeight: 0.382, category: "respiratory" },
  // ── Neurological ──────────────────────────────────────────────────────
  "I63":    { hccCode: "HCC100", hccLabel: "Ischemic Stroke",                        riskWeight: 0.741, category: "neurological" },
  "G35":    { hccCode: "HCC77",  hccLabel: "Multiple Sclerosis",                     riskWeight: 0.522, category: "neurological" },
  "G20":    { hccCode: "HCC78",  hccLabel: "Parkinson's Disease",                    riskWeight: 0.420, category: "neurological" },
  // ── Oncologic ─────────────────────────────────────────────────────────
  "C34":    { hccCode: "HCC12",  hccLabel: "Lung Cancer (malignant)",                riskWeight: 2.512, category: "oncologic" },
  "C50":    { hccCode: "HCC12",  hccLabel: "Breast Cancer (malignant)",              riskWeight: 1.108, category: "oncologic" },
  // ── Infectious ────────────────────────────────────────────────────────
  "B20":    { hccCode: "HCC1",   hccLabel: "HIV/AIDS",                               riskWeight: 2.014, category: "infectious" },
  "A41":    { hccCode: "HCC2",   hccLabel: "Septicemia / Severe Sepsis",             riskWeight: 1.883, category: "infectious" },
};

/**
 * Match a single ICD-10 code against the HCC map.
 * Performs prefix matching (e.g., E11.65 → E11).
 */
export function matchHcc(icd10: string): HccMatch | null {
  const code = icd10.trim().toUpperCase();

  // Exact match first
  if (HCC_MAP[code]) return { icd10: code, ...HCC_MAP[code] };

  // Prefix match (category-level codes)
  for (const prefix of Object.keys(HCC_MAP).sort((a, b) => b.length - a.length)) {
    if (code.startsWith(prefix)) return { icd10: code, ...HCC_MAP[prefix] };
  }

  return null;
}

/**
 * Detect all HCC-eligible conditions from a list of diagnoses.
 * Returns deduplicated HCC codes with the highest risk weight per category.
 */
export function detectHCC(diagnoses: string[]): HccMatch[] {
  const seen = new Map<string, HccMatch>();

  for (const dx of diagnoses) {
    const match = matchHcc(dx);
    if (!match) continue;
    const existing = seen.get(match.hccCode);
    if (!existing || match.riskWeight > existing.riskWeight) {
      seen.set(match.hccCode, match);
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.riskWeight - a.riskWeight);
}

/**
 * Compute the total RAF (Risk Adjustment Factor) score for a patient.
 */
export function computeRafScore(diagnoses: string[]): {
  totalRaf:   number;
  hccMatches: HccMatch[];
  topHcc:     HccMatch | null;
} {
  const hccMatches = detectHCC(diagnoses);
  const totalRaf   = hccMatches.reduce((sum, h) => sum + h.riskWeight, 0);
  return { totalRaf: Number(totalRaf.toFixed(3)), hccMatches, topHcc: hccMatches[0] ?? null };
}
