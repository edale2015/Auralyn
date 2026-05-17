/**
 * headache.ts
 * Complaint Pack: Headache / Neuro Headache
 * Handles: tension, migraine, cluster, SAH, meningitis, hypertensive emergency, ICP
 */

import type {
  ComplaintPack, ExtractedClinicalState, TriageResult,
  RedFlagCriteria, Differential, QuestionSet, WorkupBundle,
  DispositionRule, MedicationGroup
} from "./types";
import { buildStateFromInput, type ValidationInput } from "./validationHelpers";

const RED_FLAGS: RedFlagCriteria[] = [
  {
    id: "RF_HA_001",
    label: "Thunderclap onset — worst headache of life",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I60.9",
    match: s => !!(s.symptoms["thunderclap"] || (s.symptoms["worst_ever"] && s.symptoms["sudden_onset"])),
  },
  {
    id: "RF_HA_002",
    label: "Fever + neck stiffness (meningismus)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "G03.9",
    match: s => !!(s.symptoms["neck_stiffness"] && ((s.tempF ?? 0) >= 100.4 || s.symptoms["fever"])),
  },
  {
    id: "RF_HA_003",
    label: "New focal neurological deficit",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "G44.309",
    match: s => !!(s.symptoms["focal_neuro"] || s.symptoms["arm_weakness"] || s.symptoms["facial_droop"] || s.symptoms["speech_difficulty"]),
  },
  {
    id: "RF_HA_004",
    label: "Papilledema / vision changes with headache",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "G44.309",
    match: s => !!(s.symptoms["vision_changes"] && s.symptoms["headache_worsening_valsalva"]),
  },
  {
    id: "RF_HA_005",
    label: "SBP ≥ 180 with severe headache",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "I16.1",
    match: s => (s.sbp ?? 0) >= 180,
  },
  {
    id: "RF_HA_006",
    label: "Altered mental status or confusion",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R41.3",
    match: s => !!(s.symptoms["altered_mental_status"] || s.symptoms["confusion"]),
  },
  {
    id: "RF_HA_007",
    label: "Headache after head trauma",
    severity: "high",
    action: "ER_URGENT",
    icd10: "S09.90XA",
    match: s => !!(s.symptoms["post_trauma"]),
  },
  {
    id: "RF_HA_008",
    label: "Immunocompromised with new headache",
    severity: "high",
    action: "ER_URGENT",
    icd10: "G03.9",
    match: s => s.immunocompromised === true,
  },
  {
    id: "RF_HA_009",
    label: "Headache worsens lying down (↑ICP pattern)",
    severity: "high",
    action: "ER_URGENT",
    icd10: "G93.2",
    match: s => !!(s.symptoms["worse_supine"] && s.symptoms["morning_headache"] && s.symptoms["vomiting"]),
  },
];

// SNOOP criteria helper
function snoopScore(s: ExtractedClinicalState): number {
  let n = 0;
  if (s.symptoms["systemic_sx"] || (s.tempF ?? 0) >= 100.4) n++;
  if (s.symptoms["focal_neuro"]) n++;
  if ((s.ageYears ?? 0) >= 50 && !s.symptoms["prior_headache_hx"]) n++;
  if (s.symptoms["sudden_onset"] || s.symptoms["thunderclap"]) n++;
  if (s.symptoms["progressive_worsening"]) n++;
  return n;
}

const DIFFERENTIALS: Differential[] = [
  {
    id: "DX_HA_SAH",
    name: "Subarachnoid Hemorrhage",
    icd10: "I60.9",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["thunderclap"])    score += 50;
      if (s.symptoms["worst_ever"])     score += 25;
      if (s.symptoms["sudden_onset"])   score += 15;
      if (s.symptoms["neck_stiffness"]) score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_HA_MENINGITIS",
    name: "Bacterial Meningitis",
    icd10: "G00.9",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["neck_stiffness"] && (s.tempF ?? 0) >= 100.4) score += 60;
      if (s.symptoms["photophobia"])     score += 15;
      if (s.symptoms["rash_petechiae"]) score += 20;
      if (s.symptoms["altered_mental_status"]) score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_HA_HYPERTENSIVE",
    name: "Hypertensive Emergency",
    icd10: "I16.1",
    cannotMiss: true,
    dispositionIfLikely: "ER_IMMEDIATE",
    criteria: s => {
      let score = 0;
      if ((s.sbp ?? 0) >= 180)              score += 60;
      if (s.comorbidities.includes("hypertension")) score += 20;
      if (s.symptoms["vision_changes"])     score += 15;
      if (s.symptoms["focal_neuro"])        score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_HA_ICP",
    name: "Elevated ICP / Brain Tumor",
    icd10: "G93.2",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.symptoms["worse_supine"])        score += 30;
      if (s.symptoms["morning_headache"])    score += 25;
      if (s.symptoms["progressive_worsening"]) score += 25;
      if (s.symptoms["vomiting"])            score += 15;
      if (s.symptoms["vision_changes"])      score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_HA_MIGRAINE",
    name: "Migraine with or without Aura",
    icd10: "G43.909",
    cannotMiss: false,
    dispositionIfLikely: "PRIMARY_CARE_48H",
    criteria: s => {
      let score = 0;
      if (s.symptoms["prior_migraine_hx"])   score += 30;
      if (s.symptoms["unilateral"])          score += 20;
      if (s.symptoms["pulsating"])           score += 15;
      if (s.symptoms["photophobia"])         score += 15;
      if (s.symptoms["phonophobia"])         score += 10;
      if (s.symptoms["aura"])                score += 10;
      if (!s.symptoms["fever"] && !s.symptoms["neck_stiffness"]) score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_HA_TENSION",
    name: "Tension-Type Headache",
    icd10: "G44.209",
    cannotMiss: false,
    dispositionIfLikely: "HOME_CARE",
    criteria: s => {
      let score = 0;
      if (s.symptoms["bilateral"])           score += 30;
      if (s.symptoms["pressure_tightening"]) score += 25;
      if (s.symptoms["mild_moderate"])       score += 20;
      if (!s.symptoms["photophobia"] && !s.symptoms["nausea"]) score += 15;
      if (s.symptoms["stress"])              score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_HA_CLUSTER",
    name: "Cluster Headache",
    icd10: "G44.009",
    cannotMiss: false,
    dispositionIfLikely: "PRIMARY_CARE_48H",
    criteria: s => {
      let score = 0;
      if (s.symptoms["periorbital_pain"])     score += 35;
      if (s.symptoms["lacrimation"])          score += 20;
      if (s.symptoms["nasal_congestion"])     score += 15;
      if (s.symptoms["restlessness"])         score += 15;
      if (s.sex === "male")                   score += 10;
      return Math.min(score, 100);
    },
  },
];

const QUESTION_SETS: QuestionSet[] = [
  {
    phase: "hpi",
    questions: [
      { id: "Q_HA_01", text: "Was this headache sudden like a thunderclap or an explosion in your head?", type: "yesno", extractKey: "thunderclap", required: true },
      { id: "Q_HA_02", text: "Is this the worst headache of your life?", type: "yesno", extractKey: "worst_ever", required: true },
      { id: "Q_HA_03", text: "Where is the headache — one side, both sides, or all over?", type: "multichoice", options: ["One side", "Both sides", "All over / generalized", "Back of head"], extractKey: "location", required: true },
      { id: "Q_HA_04", text: "How would you describe the pain — throbbing, pressure/squeezing, stabbing?", type: "multichoice", options: ["Throbbing/pulsating", "Pressure/tightening", "Stabbing/sharp", "Dull/aching"], extractKey: "pain_quality", required: true },
      { id: "Q_HA_05", text: "On a scale of 1–10, how severe is it?", type: "scale", extractKey: "pain_score", required: true },
      { id: "Q_HA_06", text: "How long have you had this headache?", type: "open", extractKey: "duration", required: true },
      { id: "Q_HA_07", text: "Is it getting progressively worse over days or weeks?", type: "yesno", extractKey: "progressive_worsening", required: false },
    ],
  },
  {
    phase: "ros",
    questions: [
      { id: "Q_HA_08", text: "Do you have a stiff neck — painful to touch chin to chest?", type: "yesno", extractKey: "neck_stiffness", required: true },
      { id: "Q_HA_09", text: "Any fever or chills?", type: "yesno", extractKey: "fever", required: true },
      { id: "Q_HA_10", text: "Any nausea or vomiting?", type: "yesno", extractKey: "nausea", required: false },
      { id: "Q_HA_11", text: "Sensitivity to light or sound?", type: "yesno", extractKey: "photophobia", required: false },
      { id: "Q_HA_12", text: "Any vision changes, double vision, or blind spots?", type: "yesno", extractKey: "vision_changes", required: true },
      { id: "Q_HA_13", text: "Any weakness, numbness, trouble speaking or walking?", type: "yesno", extractKey: "focal_neuro", required: true },
      { id: "Q_HA_14", text: "Is the headache worse in the morning or when lying flat?", type: "yesno", extractKey: "worse_supine", required: false },
      { id: "Q_HA_15", text: "Eye pain or redness around one eye?", type: "yesno", extractKey: "periorbital_pain", required: false },
    ],
  },
  {
    phase: "pmh",
    questions: [
      { id: "Q_HA_16", text: "Do you have a history of migraines or recurring headaches?", type: "yesno", extractKey: "prior_migraine_hx", required: true },
      { id: "Q_HA_17", text: "Is this headache different from your usual headaches?", type: "yesno", extractKey: "different_from_usual", required: false, condition: s => !!(s.symptoms["prior_migraine_hx"]) },
      { id: "Q_HA_18", text: "Do you have high blood pressure?", type: "yesno", extractKey: "htn_hx", required: true },
      { id: "Q_HA_19", text: "Any recent head injury or trauma?", type: "yesno", extractKey: "post_trauma", required: true },
    ],
  },
  {
    phase: "safety",
    questions: [
      { id: "Q_HA_20", text: "Any rash — especially tiny red or purple spots?", type: "yesno", extractKey: "rash_petechiae", required: true },
      { id: "Q_HA_21", text: "Any confusion, memory problems, or strange behavior?", type: "yesno", extractKey: "altered_mental_status", required: true },
    ],
  },
];

const WORKUP_BUNDLES: WorkupBundle[] = [
  {
    id: "WU_HA_CT",
    label: "CT Head Non-Contrast",
    tests: ["CT Head without contrast"],
    indication: s => !!(s.symptoms["thunderclap"] || s.symptoms["worst_ever"] || s.symptoms["focal_neuro"] || s.symptoms["altered_mental_status"] || s.symptoms["post_trauma"]),
  },
  {
    id: "WU_HA_LP",
    label: "Lumbar Puncture (if CT neg + thunderclap)",
    tests: ["LP — opening pressure, cell count, glucose, protein, xanthochromia"],
    indication: s => !!(s.symptoms["thunderclap"] && !s.symptoms["focal_neuro"]),
  },
  {
    id: "WU_HA_MRI",
    label: "MRI Brain with/without contrast",
    tests: ["MRI Brain w/ and w/o contrast"],
    indication: s => !!(s.symptoms["progressive_worsening"] || s.symptoms["worse_supine"] || s.symptoms["vision_changes"]),
  },
  {
    id: "WU_HA_BP",
    label: "Blood Pressure Measurement",
    tests: ["BP bilateral arms", "BMP (hypertensive urgency)"],
    indication: s => (s.sbp ?? 0) >= 160 || s.comorbidities.includes("hypertension"),
  },
];

const DISPOSITION_RULES: DispositionRule[] = [
  {
    id: "D_HA_01",
    label: "ER Immediate — SNOOP criteria or thunderclap",
    disposition: "ER_IMMEDIATE",
    color: "red",
    priority: 1,
    rationale: "Life-threatening headache etiology cannot be excluded. Immediate CT/LP required.",
    condition: s => RED_FLAGS.filter(r => r.severity === "critical").some(r => r.match(s)),
  },
  {
    id: "D_HA_02",
    label: "ER Urgent — high SNOOP score or trauma",
    disposition: "ER_URGENT",
    color: "red",
    priority: 2,
    rationale: "Secondary headache likely. Urgent imaging needed.",
    condition: s => snoopScore(s) >= 2 || !!(s.symptoms["post_trauma"]) || s.immunocompromised,
  },
  {
    id: "D_HA_03",
    label: "Urgent Care Today — atypical migraine or new pattern",
    disposition: "URGENT_CARE_TODAY",
    color: "orange",
    priority: 3,
    rationale: "New-onset or pattern change headache. Evaluation needed.",
    condition: s => !!(s.symptoms["different_from_usual"]) || snoopScore(s) >= 1,
  },
  {
    id: "D_HA_04",
    label: "Primary Care 48h — episodic migraine or tension",
    disposition: "PRIMARY_CARE_48H",
    color: "yellow",
    priority: 4,
    rationale: "Consistent with known migraine or tension-type headache pattern.",
    condition: s => !!(s.symptoms["prior_migraine_hx"] && !s.symptoms["different_from_usual"]),
  },
  {
    id: "D_HA_05",
    label: "Home Care — typical tension headache",
    disposition: "HOME_CARE",
    color: "green",
    priority: 5,
    rationale: "Low-risk tension headache. OTC analgesics appropriate.",
    condition: () => true,
  },
];

const MEDICATION_GROUPS: MedicationGroup[] = [
  {
    group: "Migraine — Acute Abortive",
    agents: ["Sumatriptan 100mg PO or 6mg SQ", "Rizatriptan 10mg ODT", "Ergotamine/Caffeine (Cafergot)"],
    indication: "Moderate-severe migraine",
    contraindications: ["CAD", "Uncontrolled HTN", "Basilar/hemiplegic migraine", "MAOIs"],
  },
  {
    group: "Migraine — Non-Triptan",
    agents: ["NSAIDs (Ibuprofen 600-800mg)", "Ketorolac 30mg IM", "Metoclopramide 10mg IV/IM (antiemetic + abortive)"],
    indication: "Mild-moderate migraine or triptan failure",
    contraindications: ["GI bleeding", "Renal disease (NSAIDs)"],
  },
  {
    group: "Tension Headache",
    agents: ["Acetaminophen 650-1000mg q6h", "Ibuprofen 400mg q8h"],
    indication: "Tension-type headache",
    contraindications: ["Hepatic disease (APAP)", "GI ulcer (NSAIDs)"],
  },
  {
    group: "Hypertensive Urgency/Emergency",
    agents: ["Labetalol 200mg PO (urgency)", "Nicardipine IV (emergency)", "Clonidine 0.1-0.2mg PO (urgency)"],
    indication: "Hypertensive headache with elevated BP",
    contraindications: ["Asthma (labetalol)", "Heart block"],
  },
];

function computeTriage(state: ExtractedClinicalState): TriageResult {
  state.scores["SNOOP"] = snoopScore(state);

  const scored = DIFFERENTIALS.map(d => ({
    id: d.id, name: d.name, icd10: d.icd10,
    score: d.criteria(state), cannotMiss: d.cannotMiss,
  })).sort((a, b) => b.score - a.score);

  const triggered = RED_FLAGS.filter(rf => rf.match(state));
  const dispositionRule = DISPOSITION_RULES.find(r => r.condition(state))!;
  const workup = WORKUP_BUNDLES.filter(wb => wb.indication(state)).flatMap(wb => wb.tests);

  const topDx = scored[0]?.id ?? "";
  const meds = topDx === "DX_HA_MIGRAINE" ? MEDICATION_GROUPS[0].agents :
               topDx === "DX_HA_TENSION"  ? MEDICATION_GROUPS[2].agents :
               topDx === "DX_HA_HYPERTENSIVE" ? MEDICATION_GROUPS[3].agents : [];

  const gaps: string[] = [];
  if (state.sbp === undefined) gaps.push("Blood pressure not recorded");
  if (!state.symptoms["neck_stiffness"] && !!(triggered.length)) gaps.push("Meningismus assessment needed");

  return {
    complaintId: state.complaintId,
    disposition: dispositionRule.disposition,
    dispositionColor: dispositionRule.color,
    dispositionLabel: dispositionRule.label,
    rationale: dispositionRule.rationale,
    topDifferentials: scored.slice(0, 5),
    redFlagsTriggered: triggered.map(rf => rf.label),
    workupRecommended: workup,
    medicationsToConsider: meds,
    criticalGaps: gaps,
    scores: state.scores,
    computedAt: new Date().toISOString(),
  };
}

export const HeadachePack: ComplaintPack = {
  id: "neuro_headache",
  displayName: "Headache",
  icd10Primary: "R51.9",
  redFlags: RED_FLAGS,
  differentials: DIFFERENTIALS,
  questionSets: QUESTION_SETS,
  workupBundles: WORKUP_BUNDLES,
  dispositionRules: DISPOSITION_RULES,
  medicationGroups: MEDICATION_GROUPS,
  computeTriage,
};

// ─── Named export for golden case validation ──────────────────────────────────
export function assessHeadache(input: ValidationInput): TriageResult {
  return HeadachePack.computeTriage(buildStateFromInput(input, "neuro_headache", "headache"));
}
