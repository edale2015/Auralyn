/**
 * HCC Capture Engine — Symptom + History → HCC Risk Adjustment
 *
 * Two-pass detection:
 *   Pass 1: Substring keyword scan of free-text symptoms / history → canonical ICD-10
 *   Pass 2: ICD-10 prefix match via hccEngine.ts → CMS-HCC V28 code, label, risk weight
 *
 * "patient has advanced COPD" → "copd" substring → J44 → HCC111 → $312 uplift
 * "history of CHF exacerbation" → "chf" substring → I50 → HCC85 → $340 uplift
 */

import { matchHcc } from "./hccEngine";

interface ConditionEntry {
  keywords:           string[];
  icd10:              string;
  estimatedUpliftUSD: number;
}

const CONDITION_MAP: ConditionEntry[] = [
  { keywords: ["diabetes", "t2dm", "type 2 diabetes", "diabetic", "hyperglycemia", "insulin resistant"],
    icd10: "E11.9", estimatedUpliftUSD: 285 },
  { keywords: ["type 1 diabetes", "t1dm", "juvenile diabetes", "insulin dependent"],
    icd10: "E11",   estimatedUpliftUSD: 318 },
  { keywords: ["congestive heart failure", "chf", "heart failure", "cardiomyopathy",
               "systolic dysfunction", "diastolic dysfunction", "reduced ejection fraction"],
    icd10: "I50",   estimatedUpliftUSD: 340 },
  { keywords: ["atrial fibrillation", "afib", "a-fib", "atrial flutter", "paroxysmal afib"],
    icd10: "I48",   estimatedUpliftUSD: 255 },
  { keywords: ["myocardial infarction", "heart attack", "stemi", "nstemi", "acute mi",
               "coronary occlusion"],
    icd10: "I21",   estimatedUpliftUSD: 312 },
  { keywords: ["copd", "chronic obstructive pulmonary", "emphysema", "chronic bronchitis",
               "obstructive lung"],
    icd10: "J44",   estimatedUpliftUSD: 312 },
  { keywords: ["asthma", "bronchospasm", "reactive airway disease"],
    icd10: "J45",   estimatedUpliftUSD: 170 },
  { keywords: ["chronic kidney", "ckd", "renal failure", "end stage renal", "esrd",
               "chronic renal insufficiency", "stage 3 kidney", "stage 4 kidney", "stage 5 kidney"],
    icd10: "N18.3", estimatedUpliftUSD: 265 },
  { keywords: ["depression", "major depressive", "mdd", "depressive disorder", "dysthymia",
               "persistent depressive"],
    icd10: "F32.9", estimatedUpliftUSD: 195 },
  { keywords: ["morbid obesity", "bmi over 40", "class iii obesity", "severe obesity"],
    icd10: "E66.01",estimatedUpliftUSD: 273 },
  { keywords: ["stroke", "ischemic stroke", "cerebrovascular accident", "cva",
               "transient ischemic attack", "tia"],
    icd10: "I63",   estimatedUpliftUSD: 320 },
  { keywords: ["lung cancer", "pulmonary malignancy", "nsclc", "sclc", "bronchogenic carcinoma",
               "lung adenocarcinoma"],
    icd10: "C34",   estimatedUpliftUSD: 520 },
  { keywords: ["breast cancer", "breast malignancy", "mammary carcinoma", "invasive ductal"],
    icd10: "C50",   estimatedUpliftUSD: 410 },
  { keywords: ["hiv positive", "human immunodeficiency virus", "aids", "antiretroviral therapy",
               "hiv/aids"],
    icd10: "B20",   estimatedUpliftUSD: 480 },
  { keywords: ["sepsis", "septicemia", "bacteremia", "severe sepsis", "septic shock"],
    icd10: "A41",   estimatedUpliftUSD: 390 },
  { keywords: ["multiple sclerosis", "ms diagnosis", "demyelinating disease"],
    icd10: "G35",   estimatedUpliftUSD: 370 },
  { keywords: ["parkinson", "parkinsonian syndrome", "parkinson's disease"],
    icd10: "G20",   estimatedUpliftUSD: 340 },
  { keywords: ["hypertension", "high blood pressure", "htn", "hypertensive"],
    icd10: "I10",   estimatedUpliftUSD: 140 },
  { keywords: ["hyperlipidemia", "high cholesterol", "dyslipidemia", "hypercholesterolemia",
               "elevated ldl"],
    icd10: "E78.5", estimatedUpliftUSD: 195 },
  { keywords: ["pneumonia", "lobar pneumonia", "community acquired pneumonia", "cap pneumonia",
               "bacterial pneumonia"],
    icd10: "J18",   estimatedUpliftUSD: 225 },
];

export interface HCCCapture {
  keyword:          string;
  icd10:            string;
  code:             string;
  description:      string;
  riskScore:        number;
  category:         string;
  estimatedUplift:  number;
}

export interface HCCCaptureResult {
  detected:             HCCCapture[];
  totalRiskScore:       number;
  totalEstimatedUplift: number;
  captureCount:         number;
}

export function detectHCCs(symptoms: string[], history: string[]): HCCCaptureResult {
  const corpus  = [...symptoms, ...history].join(" ").toLowerCase();
  const seenIcd = new Set<string>();
  const detected: HCCCapture[] = [];

  for (const entry of CONDITION_MAP) {
    const hitKeyword = entry.keywords.find((kw) => corpus.includes(kw.toLowerCase()));
    if (!hitKeyword || seenIcd.has(entry.icd10)) continue;
    seenIcd.add(entry.icd10);

    const hccMatch = matchHcc(entry.icd10);
    if (!hccMatch) continue;

    detected.push({
      keyword:        hitKeyword,
      icd10:          hccMatch.icd10,
      code:           hccMatch.hccCode,
      description:    hccMatch.hccLabel,
      riskScore:      hccMatch.riskWeight,
      category:       hccMatch.category,
      estimatedUplift:entry.estimatedUpliftUSD,
    });
  }

  return {
    detected,
    totalRiskScore:        +detected.reduce((s, h) => s + h.riskScore, 0).toFixed(3),
    totalEstimatedUplift:  +detected.reduce((s, h) => s + h.estimatedUplift, 0).toFixed(2),
    captureCount:          detected.length,
  };
}

export function detectHCCsFromIcd10(codes: string[]): HCCCaptureResult {
  const seenHcc = new Set<string>();
  const detected: HCCCapture[] = [];

  for (const code of codes) {
    const hccMatch = matchHcc(code);
    if (!hccMatch || seenHcc.has(hccMatch.hccCode)) continue;
    seenHcc.add(hccMatch.hccCode);
    const cond = CONDITION_MAP.find((c) => code.startsWith(c.icd10));
    detected.push({
      keyword:        code,
      icd10:          hccMatch.icd10,
      code:           hccMatch.hccCode,
      description:    hccMatch.hccLabel,
      riskScore:      hccMatch.riskWeight,
      category:       hccMatch.category,
      estimatedUplift:cond?.estimatedUpliftUSD ?? Math.round(hccMatch.riskWeight * 800),
    });
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
    active:           true,
    mappedConditions: CONDITION_MAP.length,
    uniqueHCCCodes:   new Set(CONDITION_MAP.map((c) => c.icd10)).size,
    matchingStrategy: "substring_with_hcc_engine_v28",
  };
}
