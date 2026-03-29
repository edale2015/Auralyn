export interface HCCCapture {
  code: string;
  description: string;
  riskScore: number;
  icd10: string;
  estimatedUplift: number;
}

const HCC_MAP: Record<string, HCCCapture> = {
  diabetes:          { code: "HCC19",  description: "Diabetes without complications",          riskScore: 0.318, icd10: "E11.9", estimatedUplift: 285 },
  "type 2 diabetes": { code: "HCC19",  description: "Diabetes without complications",          riskScore: 0.318, icd10: "E11.9", estimatedUplift: 285 },
  t2dm:              { code: "HCC19",  description: "Diabetes without complications",          riskScore: 0.318, icd10: "E11.9", estimatedUplift: 285 },
  chf:               { code: "HCC85",  description: "Congestive heart failure",                riskScore: 0.368, icd10: "I50.9", estimatedUplift: 340 },
  "heart failure":   { code: "HCC85",  description: "Congestive heart failure",                riskScore: 0.368, icd10: "I50.9", estimatedUplift: 340 },
  copd:              { code: "HCC111", description: "COPD",                                    riskScore: 0.346, icd10: "J44.1", estimatedUplift: 312 },
  ckd:               { code: "HCC136", description: "Chronic kidney disease, stage 3-5",      riskScore: 0.289, icd10: "N18.3", estimatedUplift: 265 },
  "chronic kidney":  { code: "HCC136", description: "Chronic kidney disease",                 riskScore: 0.289, icd10: "N18.3", estimatedUplift: 265 },
  depression:        { code: "HCC58",  description: "Major depressive disorder",              riskScore: 0.214, icd10: "F32.9", estimatedUplift: 195 },
  "atrial fibrillation": { code: "HCC96", description: "Atrial fibrillation",                riskScore: 0.280, icd10: "I48.0", estimatedUplift: 255 },
  afib:              { code: "HCC96",  description: "Atrial fibrillation",                    riskScore: 0.280, icd10: "I48.0", estimatedUplift: 255 },
};

export interface HCCCaptureResult {
  detected: HCCCapture[];
  totalRiskScore: number;
  totalEstimatedUplift: number;
  captureCount: number;
}

export function detectHCCs(symptoms: string[], history: string[]): HCCCaptureResult {
  const all = [...symptoms.map((s) => s.toLowerCase()), ...history.map((h) => h.toLowerCase())];
  const seen = new Set<string>();
  const detected: HCCCapture[] = [];

  for (const term of all) {
    if (HCC_MAP[term] && !seen.has(HCC_MAP[term].code)) {
      detected.push(HCC_MAP[term]);
      seen.add(HCC_MAP[term].code);
    }
  }

  return {
    detected,
    totalRiskScore:        +detected.reduce((s, h) => s + h.riskScore, 0).toFixed(3),
    totalEstimatedUplift:  +detected.reduce((s, h) => s + h.estimatedUplift, 0).toFixed(2),
    captureCount:          detected.length,
  };
}

export function getHCCCaptureStats() {
  return {
    active: true,
    mappedConditions: Object.keys(HCC_MAP).length,
    uniqueHCCCodes: new Set(Object.values(HCC_MAP).map((h) => h.code)).size,
  };
}
