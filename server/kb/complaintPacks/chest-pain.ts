/**
 * chest-pain.ts
 * Complaint Pack: Chest Pain
 * Includes HEART score computation, ACS pathway, PE risk stratification
 */

import type {
  ComplaintPack, ExtractedClinicalState, TriageResult,
  RedFlagCriteria, Differential, QuestionSet, WorkupBundle,
  DispositionRule, MedicationGroup
} from "./types";
import { buildStateFromInput, type ValidationInput } from "./validationHelpers";

// ─── Red Flags ───────────────────────────────────────────────────────────────

const RED_FLAGS: RedFlagCriteria[] = [
  {
    id: "RF_CP_001",
    label: "Crushing/squeezing chest pain with radiation",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I21.9",
    match: s => !!(s.symptoms["crushing_pain"] && (s.symptoms["arm_radiation"] || s.symptoms["jaw_radiation"])),
  },
  {
    id: "RF_CP_002",
    label: "Diaphoresis with chest pain",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I21.9",
    match: s => !!(s.symptoms["chest_pain"] && s.symptoms["diaphoresis"]),
  },
  {
    id: "RF_CP_003",
    label: "Syncope or near-syncope with chest pain",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R55",
    match: s => !!(s.symptoms["syncope"] || s.symptoms["near_syncope"]),
  },
  {
    id: "RF_CP_004",
    label: "O2 sat < 92%",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R09.02",
    match: s => (s.o2Sat ?? 99) < 92,
  },
  {
    id: "RF_CP_005",
    label: "Ripping/tearing pain — aortic dissection",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I71.01",
    match: s => !!(s.symptoms["tearing_pain"] || s.symptoms["ripping_pain"]),
  },
  {
    id: "RF_CP_006",
    label: "SBP < 90 mmHg",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R03.1",
    match: s => (s.sbp ?? 120) < 90,
  },
  {
    id: "RF_CP_007",
    label: "HR > 150 or < 40",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R00.1",
    match: s => (s.hrBpm ?? 80) > 150 || (s.hrBpm ?? 80) < 40,
  },
  {
    id: "RF_CP_008",
    label: "Acute onset worst-ever chest pain",
    severity: "high",
    action: "ER_URGENT",
    icd10: "R07.9",
    match: s => !!(s.symptoms["worst_ever_pain"] && s.symptoms["sudden_onset"]),
  },
];

// ─── HEART Score Helper ───────────────────────────────────────────────────────

function computeHEART(s: ExtractedClinicalState): number {
  let score = 0;
  // H — History
  if (s.symptoms["classic_acs_history"])       score += 2;
  else if (s.symptoms["moderate_acs_history"]) score += 1;
  // E — ECG (simplified — mark as 0 if not available)
  if (s.symptoms["ecg_lbbb"] || s.symptoms["ecg_st_changes"]) score += 2;
  else if (s.symptoms["ecg_nonspecific"])                       score += 1;
  // A — Age
  if ((s.ageYears ?? 40) >= 65)       score += 2;
  else if ((s.ageYears ?? 40) >= 45)  score += 1;
  // R — Risk factors
  const riskCount = [
    s.comorbidities.includes("hypertension"),
    s.comorbidities.includes("diabetes"),
    s.comorbidities.includes("hyperlipidemia"),
    s.comorbidities.includes("obesity"),
    s.smokingStatus === "current",
    s.symptoms["family_hx_cad"],
    s.symptoms["prior_cad"],
  ].filter(Boolean).length;
  if (riskCount >= 3 || s.symptoms["prior_cad"])  score += 2;
  else if (riskCount >= 1)                          score += 1;
  // T — Initial Troponin (if available — assume 0 if not)
  if (s.symptoms["troponin_elevated"])      score += 2;
  else if (s.symptoms["troponin_low_pos"]) score += 1;
  return score;
}

// ─── Wells PE Score ───────────────────────────────────────────────────────────

function computeWellsPE(s: ExtractedClinicalState): number {
  let score = 0;
  if (s.symptoms["dvt_signs"])           score += 3;
  if (s.symptoms["pe_more_likely"])      score += 3;
  if (s.hrBpm && s.hrBpm > 100)          score += 1.5;
  if (s.symptoms["immobilization_recent"]) score += 1.5;
  if (s.symptoms["prior_dvt_pe"])        score += 1.5;
  if (s.symptoms["hemoptysis"])          score += 1;
  if (s.comorbidities.includes("cancer")) score += 1;
  return score;
}

// ─── Differentials ────────────────────────────────────────────────────────────

const DIFFERENTIALS: Differential[] = [
  {
    id: "DX_CP_ACS_NSTEMI",
    name: "NSTEMI / Unstable Angina",
    icd10: "I21.4",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      const heart = computeHEART(s);
      return Math.min(heart * 15, 100);
    },
  },
  {
    id: "DX_CP_STEMI",
    name: "STEMI",
    icd10: "I21.3",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["crushing_pain"] && s.symptoms["arm_radiation"]) score += 40;
      if (s.symptoms["diaphoresis"]) score += 25;
      if (s.symptoms["ecg_st_elevation"]) score += 40;
      if ((s.ageYears ?? 50) >= 60) score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_CP_PE",
    name: "Pulmonary Embolism",
    icd10: "I26.99",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      const wells = computeWellsPE(s);
      return Math.min(wells * 12, 100);
    },
  },
  {
    id: "DX_CP_DISSECTION",
    name: "Aortic Dissection",
    icd10: "I71.01",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["tearing_pain"])  score += 50;
      if (s.symptoms["back_radiation"]) score += 20;
      if (s.comorbidities.includes("hypertension") || s.comorbidities.includes("marfan")) score += 20;
      if ((s.sbp ?? 120) > 180)         score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_CP_PNEUMOTHORAX",
    name: "Pneumothorax",
    icd10: "J93.9",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.symptoms["sudden_onset"] && s.symptoms["pleuritic_pain"]) score += 40;
      if ((s.o2Sat ?? 99) < 95) score += 20;
      if ((s.ageYears ?? 40) < 35 && !s.comorbidities.length) score += 15;
      if (s.symptoms["tall_thin_male"]) score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_CP_GERD",
    name: "GERD / Esophageal Spasm",
    icd10: "K21.0",
    cannotMiss: false,
    dispositionIfLikely: "TELEHEALTH",
    criteria: s => {
      let score = 0;
      if (s.symptoms["burning_sensation"])    score += 35;
      if (s.symptoms["worse_after_eating"])   score += 25;
      if (s.symptoms["regurgitation"])        score += 20;
      if (!s.symptoms["exertional"])          score += 15;
      if (s.comorbidities.includes("gerd"))   score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_CP_MSK",
    name: "Musculoskeletal / Costochondritis",
    icd10: "M94.0",
    cannotMiss: false,
    dispositionIfLikely: "HOME_CARE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["reproducible_palpation"]) score += 50;
      if (s.symptoms["positional_pain"])         score += 20;
      if (!s.symptoms["diaphoresis"])            score += 15;
      if (!s.symptoms["arm_radiation"])          score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_CP_ANXIETY",
    name: "Anxiety / Panic Attack",
    icd10: "F41.0",
    cannotMiss: false,
    dispositionIfLikely: "PRIMARY_CARE_48H",
    criteria: s => {
      let score = 0;
      if (s.symptoms["palpitations"] && s.symptoms["anxiety"])  score += 35;
      if (s.symptoms["hyperventilation"])                         score += 25;
      if (s.symptoms["prior_panic"])                             score += 25;
      if (!s.symptoms["exertional"])                             score += 15;
      return Math.min(score, 100);
    },
  },
];

// ─── Question Sets ────────────────────────────────────────────────────────────

const QUESTION_SETS: QuestionSet[] = [
  {
    phase: "hpi",
    questions: [
      { id: "Q_CP_01", text: "Describe the chest pain — is it sharp, crushing, squeezing, burning, or tearing?", type: "multichoice", options: ["Sharp", "Crushing/squeezing", "Burning", "Tearing/ripping", "Pressure", "Dull/aching"], extractKey: "pain_quality", required: true },
      { id: "Q_CP_02", text: "When did the pain start and how quickly did it come on?", type: "multichoice", options: ["Sudden (seconds)", "Over minutes", "Gradual onset"], extractKey: "onset_speed", required: true },
      { id: "Q_CP_03", text: "Does the pain go anywhere — to your arm, shoulder, jaw, or back?", type: "yesno", extractKey: "pain_radiation", required: true },
      { id: "Q_CP_04", text: "On a scale of 1–10, how severe is the pain right now?", type: "scale", extractKey: "pain_score", required: true },
      { id: "Q_CP_05", text: "Does the pain get worse with exertion or activity?", type: "yesno", extractKey: "exertional", required: true },
      { id: "Q_CP_06", text: "Does the pain change with position or breathing?", type: "yesno", extractKey: "pleuritic_pain", required: false },
      { id: "Q_CP_07", text: "Is the pain worse after eating or lying down?", type: "yesno", extractKey: "worse_after_eating", required: false },
      { id: "Q_CP_08", text: "Does pressing on your chest make the pain worse?", type: "yesno", extractKey: "reproducible_palpation", required: false },
    ],
  },
  {
    phase: "ros",
    questions: [
      { id: "Q_CP_09", text: "Are you sweating or clammy?", type: "yesno", extractKey: "diaphoresis", required: true },
      { id: "Q_CP_10", text: "Any shortness of breath?", type: "yesno", extractKey: "dyspnea", required: true },
      { id: "Q_CP_11", text: "Any nausea or vomiting?", type: "yesno", extractKey: "nausea", required: false },
      { id: "Q_CP_12", text: "Have you fainted or felt like you were about to faint?", type: "yesno", extractKey: "syncope", required: true },
      { id: "Q_CP_13", text: "Any palpitations or racing heart?", type: "yesno", extractKey: "palpitations", required: false },
      { id: "Q_CP_14", text: "Any calf swelling, leg pain, or recent long travel (>4h)?", type: "yesno", extractKey: "dvt_signs", required: false },
    ],
  },
  {
    phase: "pmh",
    questions: [
      { id: "Q_CP_15", text: "Have you ever had a heart attack, stents, or bypass surgery?", type: "yesno", extractKey: "prior_cad", required: true },
      { id: "Q_CP_16", text: "Do you have high blood pressure, diabetes, or high cholesterol?", type: "yesno", extractKey: "cardiac_risk_factors", required: true },
      { id: "Q_CP_17", text: "Any family history of early heart disease (before age 60)?", type: "yesno", extractKey: "family_hx_cad", required: false },
      { id: "Q_CP_18", text: "Do you take aspirin, blood thinners, or nitroglycerin?", type: "yesno", extractKey: "cardiac_meds", required: true },
    ],
  },
  {
    phase: "safety",
    questions: [
      { id: "Q_CP_19", text: "Is this the worst chest pain of your life?", type: "yesno", extractKey: "worst_ever_pain", required: true },
      { id: "Q_CP_20", text: "Right now, does the pain feel like an elephant sitting on your chest?", type: "yesno", extractKey: "crushing_pain", required: true },
    ],
  },
];

// ─── Workup Bundles ───────────────────────────────────────────────────────────

const WORKUP_BUNDLES: WorkupBundle[] = [
  {
    id: "WU_CP_ACS",
    label: "ACS Panel",
    tests: ["12-Lead ECG", "Troponin I/T (serial × 3h)", "BMP", "CBC", "CXR"],
    indication: s => computeHEART(s) >= 3 || !!(s.symptoms["crushing_pain"] || s.symptoms["diaphoresis"]),
  },
  {
    id: "WU_CP_PE",
    label: "PE Workup",
    tests: ["D-Dimer", "CT Pulmonary Angiogram", "CXR"],
    indication: s => computeWellsPE(s) >= 4,
  },
  {
    id: "WU_CP_DISSECTION",
    label: "Aortic Dissection Panel",
    tests: ["CT Chest with contrast", "CXR", "CMP"],
    indication: s => !!(s.symptoms["tearing_pain"]),
  },
  {
    id: "WU_CP_BASIC",
    label: "Basic Evaluation",
    tests: ["12-Lead ECG", "CXR", "BMP"],
    indication: () => true,
  },
];

// ─── Disposition Rules ────────────────────────────────────────────────────────

const DISPOSITION_RULES: DispositionRule[] = [
  {
    id: "D_CP_01",
    label: "ER Immediate — STEMI protocol or critical red flag",
    disposition: "ER_IMMEDIATE",
    color: "red",
    priority: 1,
    rationale: "Critical hemodynamic compromise or STEMI features. Call 911.",
    condition: s => RED_FLAGS.filter(r => r.severity === "critical").some(r => r.match(s)),
  },
  {
    id: "D_CP_02",
    label: "ER Urgent — High HEART score (≥4) or PE risk",
    disposition: "ER_URGENT",
    color: "red",
    priority: 2,
    rationale: "Elevated HEART score or Wells ≥4 requires emergency evaluation.",
    condition: s => computeHEART(s) >= 4 || computeWellsPE(s) >= 4,
  },
  {
    id: "D_CP_03",
    label: "Urgent Care Today — Intermediate HEART (2-3)",
    disposition: "URGENT_CARE_TODAY",
    color: "orange",
    priority: 3,
    rationale: "Intermediate cardiac risk. Same-day evaluation needed.",
    condition: s => computeHEART(s) >= 2,
  },
  {
    id: "D_CP_04",
    label: "Telehealth — Likely GERD or MSK",
    disposition: "TELEHEALTH",
    color: "yellow",
    priority: 4,
    rationale: "Low cardiac risk features. GERD or musculoskeletal most likely.",
    condition: s => {
      const gerd = DIFFERENTIALS.find(d => d.id === "DX_CP_GERD")!.criteria(s);
      const msk  = DIFFERENTIALS.find(d => d.id === "DX_CP_MSK")!.criteria(s);
      return gerd >= 50 || msk >= 60;
    },
  },
  {
    id: "D_CP_05",
    label: "Primary Care 48h — Low risk",
    disposition: "PRIMARY_CARE_48H",
    color: "green",
    priority: 5,
    rationale: "Low-risk chest pain. Follow up with primary care.",
    condition: () => true,
  },
];

// ─── Medication Groups ────────────────────────────────────────────────────────

const MEDICATION_GROUPS: MedicationGroup[] = [
  {
    group: "ACS — Acute",
    agents: ["Aspirin 325mg (chew)", "Nitroglycerin 0.4mg SL q5min × 3 (if SBP > 90)", "Morphine 2-4mg IV PRN"],
    indication: "Suspected ACS pending transfer to ER",
    contraindications: ["Aspirin allergy", "SBP < 90 (nitro)", "PDE5 inhibitor use within 24-48h (nitro)"],
  },
  {
    group: "PE — Anticoagulation Bridge",
    agents: ["Enoxaparin (weight-based)", "Heparin IV (in ER)"],
    indication: "Confirmed or high-suspicion PE",
    contraindications: ["Active bleeding", "HIT history"],
  },
  {
    group: "GERD",
    agents: ["Omeprazole 20mg daily", "Famotidine 20mg BID", "Antacid PRN"],
    indication: "GERD / reflux esophagitis",
    contraindications: [],
  },
];

// ─── Compute Triage ───────────────────────────────────────────────────────────

function computeTriage(state: ExtractedClinicalState): TriageResult {
  // Populate computed scores
  state.scores["HEART"] = computeHEART(state);
  state.scores["WellsPE"] = computeWellsPE(state);

  const scored = DIFFERENTIALS.map(d => ({
    id: d.id, name: d.name, icd10: d.icd10,
    score: d.criteria(state), cannotMiss: d.cannotMiss,
  })).sort((a, b) => b.score - a.score);

  const triggered = RED_FLAGS.filter(rf => rf.match(state));
  const dispositionRule = DISPOSITION_RULES.find(r => r.condition(state))!;
  const workup = WORKUP_BUNDLES.filter(wb => wb.indication(state)).flatMap(wb => wb.tests);

  const gaps: string[] = [];
  if (state.o2Sat === undefined)  gaps.push("O2 saturation not obtained");
  if (state.sbp === undefined)    gaps.push("Blood pressure not recorded");
  if (state.hrBpm === undefined)  gaps.push("Heart rate not recorded");

  return {
    complaintId: state.complaintId,
    disposition: dispositionRule.disposition,
    dispositionColor: dispositionRule.color,
    dispositionLabel: dispositionRule.label,
    rationale: dispositionRule.rationale,
    topDifferentials: scored.slice(0, 5),
    redFlagsTriggered: triggered.map(rf => rf.label),
    workupRecommended: workup,
    medicationsToConsider: state.scores["HEART"] >= 4 ? MEDICATION_GROUPS[0].agents : [],
    criticalGaps: gaps,
    scores: state.scores,
    computedAt: new Date().toISOString(),
  };
}

export const ChestPainPack: ComplaintPack = {
  id: "chest_pain",
  displayName: "Chest Pain",
  icd10Primary: "R07.9",
  redFlags: RED_FLAGS,
  differentials: DIFFERENTIALS,
  questionSets: QUESTION_SETS,
  workupBundles: WORKUP_BUNDLES,
  dispositionRules: DISPOSITION_RULES,
  medicationGroups: MEDICATION_GROUPS,
  computeTriage,
};

// ─── Named export for golden case validation ──────────────────────────────────
export function assessChestPain(input: ValidationInput): TriageResult {
  return ChestPainPack.computeTriage(buildStateFromInput(input, "chest_pain", "chest pain"));
}
