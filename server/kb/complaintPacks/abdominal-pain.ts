/**
 * abdominal-pain.ts
 * Complaint Pack: Abdominal Pain
 * Handles: appendicitis, cholecystitis, PUD, bowel obstruction, pancreatitis, AAA, ectopic
 */

import type {
  ComplaintPack, ExtractedClinicalState, TriageResult,
  RedFlagCriteria, Differential, QuestionSet, WorkupBundle,
  DispositionRule, MedicationGroup
} from "./types";

const RED_FLAGS: RedFlagCriteria[] = [
  {
    id: "RF_ABD_001",
    label: "Peritoneal signs (rigidity/guarding/rebound)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R19.3",
    match: s => !!(s.symptoms["rigidity"] || s.symptoms["guarding"] || s.symptoms["rebound_tenderness"]),
  },
  {
    id: "RF_ABD_002",
    label: "Signs of shock (SBP < 90, HR > 120)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R57.9",
    match: s => (s.sbp ?? 120) < 90 || (s.hrBpm ?? 80) > 120,
  },
  {
    id: "RF_ABD_003",
    label: "Hematemesis or melena",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "K92.1",
    match: s => !!(s.symptoms["hematemesis"] || s.symptoms["melena"]),
  },
  {
    id: "RF_ABD_004",
    label: "Pulsatile abdominal mass (AAA)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I71.4",
    match: s => !!(s.symptoms["pulsatile_mass"]),
  },
  {
    id: "RF_ABD_005",
    label: "Positive pregnancy test with pelvic pain (ectopic)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "O00.90",
    match: s => !!(s.pregnant && s.symptoms["pelvic_pain"] && s.symptoms["vaginal_bleeding"]),
  },
  {
    id: "RF_ABD_006",
    label: "Obstruction signs — no bowel movement ≥3d + vomiting",
    severity: "high",
    action: "ER_URGENT",
    icd10: "K56.609",
    match: s => !!(s.symptoms["obstipation"] && s.symptoms["vomiting"] && s.symptoms["abdominal_distension"]),
  },
  {
    id: "RF_ABD_007",
    label: "Fever ≥ 102°F with acute abdominal pain",
    severity: "high",
    action: "ER_URGENT",
    icd10: "R10.9",
    match: s => (s.tempF ?? 0) >= 102 && !!(s.symptoms["acute_abdominal_pain"]),
  },
  {
    id: "RF_ABD_008",
    label: "Sudden severe pain in AAA-risk patient (age ≥ 60 + HTN/smoker)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I71.4",
    match: s => (s.ageYears ?? 0) >= 60 && s.symptoms["sudden_severe_pain"] && (s.smokingStatus === "current" || s.comorbidities.includes("hypertension")),
  },
];

const DIFFERENTIALS: Differential[] = [
  {
    id: "DX_ABD_APPENDICITIS",
    name: "Appendicitis",
    icd10: "K37",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      // Alvarado score approximation
      let score = 0;
      if (s.symptoms["rlq_pain"])            score += 25;
      if (s.symptoms["migration_pain_rlq"])  score += 20;
      if ((s.tempF ?? 0) >= 100.4)           score += 15;
      if (s.symptoms["anorexia"])            score += 10;
      if (s.symptoms["nausea_vomiting"])     score += 10;
      if ((s.ageYears ?? 40) < 40)           score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_CHOLECYSTITIS",
    name: "Acute Cholecystitis",
    icd10: "K81.0",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.symptoms["ruq_pain"])              score += 35;
      if (s.symptoms["after_fatty_meal"])      score += 15;
      if (s.symptoms["murphy_sign"])           score += 25;
      if ((s.tempF ?? 0) >= 100.4)             score += 10;
      if (s.symptoms["radiates_right_shoulder"]) score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_PANCREATITIS",
    name: "Acute Pancreatitis",
    icd10: "K85.9",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.symptoms["epigastric_pain"])     score += 30;
      if (s.symptoms["radiates_to_back"])    score += 25;
      if (s.symptoms["nausea_vomiting"])     score += 15;
      if (s.comorbidities.includes("alcohol_use")) score += 20;
      if (s.symptoms["worse_lying_flat"])    score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_AAA",
    name: "Ruptured / Symptomatic AAA",
    icd10: "I71.4",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["pulsatile_mass"])      score += 60;
      if ((s.ageYears ?? 0) >= 65)           score += 15;
      if (s.symptoms["back_flank_pain"])     score += 15;
      if (s.comorbidities.includes("known_aaa")) score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_ECTOPIC",
    name: "Ectopic Pregnancy",
    icd10: "O00.90",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if (s.sex !== "female") return 0;
      if (s.pregnant)                          score += 40;
      if (s.symptoms["pelvic_pain"])           score += 30;
      if (s.symptoms["vaginal_bleeding"])      score += 20;
      if (s.symptoms["missed_period"])         score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_PUD",
    name: "Peptic Ulcer Disease",
    icd10: "K27.9",
    cannotMiss: false,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.symptoms["epigastric_pain"])     score += 30;
      if (s.symptoms["better_with_food"])    score += 15;
      if (s.symptoms["worse_at_night"])      score += 10;
      if (s.symptoms["nsaid_use"])           score += 15;
      if (s.symptoms["h_pylori_hx"])         score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_OBSTRUCTION",
    name: "Bowel Obstruction",
    icd10: "K56.609",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.symptoms["obstipation"])           score += 30;
      if (s.symptoms["abdominal_distension"])  score += 25;
      if (s.symptoms["colicky_pain"])          score += 20;
      if (s.symptoms["vomiting"])              score += 15;
      if (s.symptoms["prior_abdominal_surgery"]) score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_GERD_ESOPHAGUS",
    name: "GERD / Esophagitis",
    icd10: "K21.0",
    cannotMiss: false,
    dispositionIfLikely: "TELEHEALTH",
    criteria: s => {
      let score = 0;
      if (s.symptoms["burning_chest"])       score += 30;
      if (s.symptoms["regurgitation"])       score += 20;
      if (s.symptoms["worse_after_eating"]) score += 20;
      if (!s.symptoms["rigidity"])          score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_ABD_IBS",
    name: "Irritable Bowel Syndrome / Functional Pain",
    icd10: "K58.9",
    cannotMiss: false,
    dispositionIfLikely: "PRIMARY_CARE_ROUTINE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["chronic_intermittent"])    score += 25;
      if (s.symptoms["improved_with_bm"])        score += 25;
      if (s.symptoms["bloating"])                score += 15;
      if (!s.symptoms["fever"] && !(s.tempF && s.tempF >= 100.4)) score += 20;
      if (s.symptoms["prior_ibs_dx"])            score += 15;
      return Math.min(score, 100);
    },
  },
];

const QUESTION_SETS: QuestionSet[] = [
  {
    phase: "hpi",
    questions: [
      { id: "Q_ABD_01", text: "Where exactly is the pain? Point to the area.", type: "multichoice", options: ["Upper middle (epigastric)", "Upper right", "Upper left", "Lower right", "Lower left", "All over / diffuse", "Around the belly button"], extractKey: "pain_location", required: true },
      { id: "Q_ABD_02", text: "Did the pain start suddenly or come on gradually?", type: "multichoice", options: ["Sudden (minutes)", "Gradual (hours)", "Building over days"], extractKey: "onset_speed", required: true },
      { id: "Q_ABD_03", text: "On a scale of 1–10, how severe is the pain?", type: "scale", extractKey: "pain_score", required: true },
      { id: "Q_ABD_04", text: "Is the pain constant or does it come and go in waves?", type: "multichoice", options: ["Constant", "Colicky / comes in waves", "Intermittent"], extractKey: "pain_pattern", required: true },
      { id: "Q_ABD_05", text: "Does the pain go anywhere — to your back, shoulder, or groin?", type: "yesno", extractKey: "pain_radiation", required: false },
      { id: "Q_ABD_06", text: "Any nausea or vomiting?", type: "yesno", extractKey: "nausea_vomiting", required: true },
      { id: "Q_ABD_07", text: "Any fever or chills?", type: "yesno", extractKey: "fever", required: true },
      { id: "Q_ABD_08", text: "Any change in bowel habits — diarrhea or constipation?", type: "yesno", extractKey: "bowel_change", required: false },
    ],
  },
  {
    phase: "ros",
    questions: [
      { id: "Q_ABD_09", text: "Any blood in your stool, black tarry stools, or vomiting blood?", type: "yesno", extractKey: "gi_bleed", required: true },
      { id: "Q_ABD_10", text: "Has your belly been getting more bloated or distended?", type: "yesno", extractKey: "abdominal_distension", required: false },
      { id: "Q_ABD_11", text: "Have you had a bowel movement in the past 24–48 hours?", type: "yesno", extractKey: "recent_bm", required: false },
      { id: "Q_ABD_12", text: "Any pain when you breathe in deeply?", type: "yesno", extractKey: "pleuritic_component", required: false },
      { id: "Q_ABD_13", text: "Any yellowing of skin or eyes?", type: "yesno", extractKey: "jaundice", required: false },
    ],
  },
  {
    phase: "pmh",
    questions: [
      { id: "Q_ABD_14", text: "Have you had any abdominal surgeries in the past?", type: "yesno", extractKey: "prior_abdominal_surgery", required: true },
      { id: "Q_ABD_15", text: "Any history of gallstones, ulcers, pancreatitis, or hernias?", type: "yesno", extractKey: "prior_gi_hx", required: false },
      { id: "Q_ABD_16", text: "Do you drink alcohol? How much?", type: "open", extractKey: "alcohol_use", required: false },
      { id: "Q_ABD_17", text: "Are you taking NSAIDs (ibuprofen, aspirin, naproxen) regularly?", type: "yesno", extractKey: "nsaid_use", required: false },
      { id: "Q_ABD_18", text: "Any chance of pregnancy?", type: "yesno", extractKey: "possible_pregnancy", required: false, condition: s => s.sex === "female" && (s.ageYears ?? 0) < 55 },
    ],
  },
  {
    phase: "safety",
    questions: [
      { id: "Q_ABD_19", text: "Is the pain so severe you cannot get comfortable, even lying still?", type: "yesno", extractKey: "severe_constant_pain", required: true },
      { id: "Q_ABD_20", text: "Do you feel dizzy, faint, or like you might pass out?", type: "yesno", extractKey: "syncope_presyncope", required: true },
      { id: "Q_ABD_21", text: "Is your belly hard or rigid to the touch?", type: "yesno", extractKey: "rigidity", required: true },
    ],
  },
];

const WORKUP_BUNDLES: WorkupBundle[] = [
  {
    id: "WU_ABD_BASIC",
    label: "Basic Abdominal Panel",
    tests: ["CBC w/ diff", "BMP", "LFTs", "Lipase", "UA"],
    indication: () => true,
  },
  {
    id: "WU_ABD_IMAGING_EMERGENCY",
    label: "Emergency Abdominal Imaging",
    tests: ["CT Abdomen/Pelvis with contrast", "FAST ultrasound (if unstable)"],
    indication: s => !!(s.symptoms["rigidity"] || s.symptoms["guarding"] || (s.sbp ?? 120) < 90),
  },
  {
    id: "WU_ABD_RUQ_US",
    label: "RUQ Ultrasound",
    tests: ["RUQ Ultrasound", "LFTs", "Bili total/direct"],
    indication: s => !!(s.symptoms["ruq_pain"] || s.symptoms["jaundice"]),
  },
  {
    id: "WU_ABD_APPENDIX",
    label: "Appendicitis Protocol",
    tests: ["CT Abdomen/Pelvis w/ contrast", "CRP", "WBC differential"],
    indication: s => !!(s.symptoms["rlq_pain"] || s.symptoms["migration_pain_rlq"]),
  },
  {
    id: "WU_ABD_PREGNANCY",
    label: "Ectopic Pregnancy Workup",
    tests: ["Urine/serum hCG", "Pelvic ultrasound STAT", "Type & Screen"],
    indication: s => s.sex === "female" && !!(s.symptoms["pelvic_pain"] || s.possible_pregnancy || s.pregnant),
  },
  {
    id: "WU_ABD_GI_BLEED",
    label: "GI Bleed Panel",
    tests: ["CBC", "BMP", "LFTs", "PT/INR", "Type & Cross", "NG lavage (if upper GI)"],
    indication: s => !!(s.symptoms["hematemesis"] || s.symptoms["melena"] || s.symptoms["gi_bleed"]),
  },
];

const DISPOSITION_RULES: DispositionRule[] = [
  {
    id: "D_ABD_01",
    label: "ER Immediate — peritoneal signs or hemodynamic instability",
    disposition: "ER_IMMEDIATE",
    color: "red",
    priority: 1,
    rationale: "Surgical emergency or hemodynamic compromise. Call 911.",
    condition: s => RED_FLAGS.filter(r => r.severity === "critical").some(r => r.match(s)),
  },
  {
    id: "D_ABD_02",
    label: "ER Urgent — high-risk diagnosis likely",
    disposition: "ER_URGENT",
    color: "red",
    priority: 2,
    rationale: "Appendicitis, cholecystitis, or obstruction suspected. Same-day ER needed.",
    condition: s => RED_FLAGS.filter(r => r.severity === "high").some(r => r.match(s)) ||
      !!(s.symptoms["rlq_pain"] && (s.tempF ?? 0) >= 100.4) ||
      !!(s.symptoms["ruq_pain"] && s.symptoms["murphy_sign"]),
  },
  {
    id: "D_ABD_03",
    label: "Urgent Care Today — moderate abdominal pain with risk features",
    disposition: "URGENT_CARE_TODAY",
    color: "orange",
    priority: 3,
    rationale: "Requires same-day evaluation and possibly labs/imaging.",
    condition: s => (s.tempF ?? 0) >= 101 || Number(s.symptoms["pain_score"] ?? 0) >= 7,
  },
  {
    id: "D_ABD_04",
    label: "Telehealth — likely GERD or functional pain",
    disposition: "TELEHEALTH",
    color: "yellow",
    priority: 4,
    rationale: "Symptoms consistent with GERD or functional etiology.",
    condition: s => {
      const gerd = DIFFERENTIALS.find(d => d.id === "DX_ABD_GERD_ESOPHAGUS")!.criteria(s);
      return gerd >= 50 && !s.symptoms["fever"];
    },
  },
  {
    id: "D_ABD_05",
    label: "Primary Care — chronic/subacute symptoms",
    disposition: "PRIMARY_CARE_ROUTINE",
    color: "green",
    priority: 5,
    rationale: "Chronic or subacute symptoms consistent with IBS or functional disorder.",
    condition: () => true,
  },
];

const MEDICATION_GROUPS: MedicationGroup[] = [
  {
    group: "Antiemetics",
    agents: ["Ondansetron 4mg PO/ODT", "Metoclopramide 10mg IV/IM", "Promethazine 12.5mg IV/IM"],
    indication: "Nausea and vomiting in acute abdomen",
    contraindications: ["QT prolongation (ondansetron > 32mg IV)"],
  },
  {
    group: "Analgesia — Abdominal Pain",
    agents: ["Morphine 2-4mg IV q4h PRN (moderate)", "Ketorolac 15-30mg IV/IM (non-surgical)"],
    indication: "Pain management pending surgical evaluation",
    contraindications: ["Allergy", "Respiratory depression (opioids)", "Renal disease (ketorolac)"],
  },
  {
    group: "Cholecystitis / Biliary",
    agents: ["Piperacillin-tazobactam 3.375g IV q6h", "Cefazolin 1g IV q8h (mild)"],
    indication: "Acute cholecystitis or biliary sepsis",
    contraindications: ["PCN allergy (use aztreonam + flagyl alternative)"],
  },
  {
    group: "GERD",
    agents: ["Omeprazole 40mg daily", "Pantoprazole 40mg daily", "Antacid suspension PRN"],
    indication: "GERD / peptic ulcer disease",
    contraindications: ["Interactions: clopidogrel (omeprazole)"],
  },
];

function computeTriage(state: ExtractedClinicalState): TriageResult {
  const scored = DIFFERENTIALS.map(d => ({
    id: d.id, name: d.name, icd10: d.icd10,
    score: d.criteria(state), cannotMiss: d.cannotMiss,
  })).sort((a, b) => b.score - a.score);

  const triggered = RED_FLAGS.filter(rf => rf.match(state));
  const dispositionRule = DISPOSITION_RULES.find(r => r.condition(state))!;
  const workup = WORKUP_BUNDLES.filter(wb => wb.indication(state)).flatMap(wb => wb.tests);

  const gaps: string[] = [];
  if (state.sbp === undefined) gaps.push("Blood pressure not obtained");
  if (state.tempF === undefined) gaps.push("Temperature not recorded");
  if (state.sex === "female" && (state.ageYears ?? 0) < 55 && !("pregnant" in state)) {
    gaps.push("Pregnancy status unknown");
  }

  return {
    complaintId: state.complaintId,
    disposition: dispositionRule.disposition,
    dispositionColor: dispositionRule.color,
    dispositionLabel: dispositionRule.label,
    rationale: dispositionRule.rationale,
    topDifferentials: scored.slice(0, 5),
    redFlagsTriggered: triggered.map(rf => rf.label),
    workupRecommended: workup,
    medicationsToConsider: MEDICATION_GROUPS[0].agents,
    criticalGaps: gaps,
    scores: state.scores,
    computedAt: new Date().toISOString(),
  };
}

export const AbdominalPainPack: ComplaintPack = {
  id: "abdominal_pain",
  displayName: "Abdominal Pain",
  icd10Primary: "R10.9",
  redFlags: RED_FLAGS,
  differentials: DIFFERENTIALS,
  questionSets: QUESTION_SETS,
  workupBundles: WORKUP_BUNDLES,
  dispositionRules: DISPOSITION_RULES,
  medicationGroups: MEDICATION_GROUPS,
  computeTriage,
};
