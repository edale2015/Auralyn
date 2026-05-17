/**
 * gu-uti.ts
 * Complaint Pack: GU / UTI Symptoms
 * Handles: uncomplicated UTI, pyelonephritis, STI, kidney stone, urinary retention
 */

import type {
  ComplaintPack, ExtractedClinicalState, TriageResult,
  RedFlagCriteria, Differential, QuestionSet, WorkupBundle,
  DispositionRule, MedicationGroup
} from "./types";
import { buildStateFromInput, type ValidationInput } from "./validationHelpers";

const RED_FLAGS: RedFlagCriteria[] = [
  {
    id: "RF_GU_001",
    label: "Fever ≥ 101°F with flank pain (pyelonephritis/urosepsis)",
    severity: "critical",
    action: "ER_URGENT",
    icd10: "N10",
    match: s => (s.tempF ?? 0) >= 101 && !!(s.symptoms["flank_pain"]),
  },
  {
    id: "RF_GU_002",
    label: "Unable to urinate + bladder pain (urinary retention)",
    severity: "high",
    action: "ER_URGENT",
    icd10: "R33.9",
    match: s => !!(s.symptoms["urinary_retention"] && s.symptoms["suprapubic_pain"]),
  },
  {
    id: "RF_GU_003",
    label: "Pregnancy with UTI symptoms",
    severity: "high",
    action: "URGENT_CARE_TODAY",
    icd10: "O23.10",
    match: s => s.pregnant === true,
  },
  {
    id: "RF_GU_004",
    label: "Male with UTI symptoms (complicated)",
    severity: "moderate",
    action: "URGENT_CARE_TODAY",
    icd10: "N30.00",
    match: s => s.sex === "male",
  },
  {
    id: "RF_GU_005",
    label: "Recurrent UTI (≥3 in past year)",
    severity: "moderate",
    action: "PRIMARY_CARE_48H",
    icd10: "N30.00",
    match: s => !!(s.symptoms["recurrent_uti"]),
  },
  {
    id: "RF_GU_006",
    label: "Severe colicky flank pain with hematuria (stone)",
    severity: "high",
    action: "ER_URGENT",
    icd10: "N20.0",
    match: s => !!(s.symptoms["colicky_pain"] && s.symptoms["hematuria"] && s.symptoms["flank_pain"]),
  },
  {
    id: "RF_GU_007",
    label: "Signs of sepsis (fever + tachycardia + confusion)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "A41.51",
    match: s => (s.tempF ?? 0) >= 101 && (s.hrBpm ?? 0) > 100 && !!(s.symptoms["confusion"]),
  },
];

const DIFFERENTIALS: Differential[] = [
  {
    id: "DX_GU_SIMPLE_UTI",
    name: "Uncomplicated Urinary Tract Infection",
    icd10: "N30.00",
    cannotMiss: false,
    dispositionIfLikely: "TELEHEALTH",
    criteria: s => {
      let score = 0;
      if (s.symptoms["dysuria"])          score += 30;
      if (s.symptoms["frequency"])        score += 25;
      if (s.symptoms["urgency"])          score += 20;
      if (!s.symptoms["flank_pain"])      score += 10;
      if ((s.tempF ?? 99) < 101)          score += 10;
      if (s.sex === "female")             score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_GU_PYELO",
    name: "Pyelonephritis",
    icd10: "N10",
    cannotMiss: true,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.symptoms["flank_pain"])       score += 35;
      if ((s.tempF ?? 0) >= 101)          score += 30;
      if (s.symptoms["dysuria"])          score += 15;
      if (s.symptoms["nausea_vomiting"])  score += 10;
      if (s.symptoms["cvat"])             score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_GU_STONE",
    name: "Nephrolithiasis / Kidney Stone",
    icd10: "N20.0",
    cannotMiss: true,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.symptoms["colicky_pain"])       score += 40;
      if (s.symptoms["flank_pain"])         score += 25;
      if (s.symptoms["hematuria"])          score += 20;
      if (s.symptoms["nausea_vomiting"])    score += 10;
      if (s.symptoms["prior_stone"])        score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_GU_STI",
    name: "Sexually Transmitted Infection",
    icd10: "A64",
    cannotMiss: true,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.symptoms["discharge"])           score += 40;
      if (s.symptoms["new_sexual_partner"])  score += 30;
      if (s.symptoms["pelvic_pain"] && s.sex === "female") score += 20;
      if (!s.symptoms["frequency"])          score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_GU_VAGINITIS",
    name: "Vaginitis / Vulvovaginitis",
    icd10: "N76.0",
    cannotMiss: false,
    dispositionIfLikely: "TELEHEALTH",
    criteria: s => {
      let score = 0;
      if (s.sex !== "female")             return 0;
      if (s.symptoms["vaginal_discharge"]) score += 40;
      if (s.symptoms["itching"])           score += 30;
      if (s.symptoms["odor"])              score += 20;
      if (!s.symptoms["dysuria"])          score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_GU_PROSTATITIS",
    name: "Prostatitis",
    icd10: "N41.0",
    cannotMiss: false,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.sex !== "male") return 0;
      if (s.symptoms["perineal_pain"])      score += 40;
      if (s.symptoms["hesitancy"])          score += 20;
      if ((s.tempF ?? 0) >= 100.4)          score += 20;
      if (s.symptoms["dysuria"])            score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_GU_EPIDIDYMITIS",
    name: "Epididymitis / Orchitis",
    icd10: "N45.1",
    cannotMiss: true,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.sex !== "male") return 0;
      if (s.symptoms["scrotal_pain"])       score += 50;
      if (s.symptoms["scrotal_swelling"])   score += 30;
      if ((s.tempF ?? 0) >= 100.4)          score += 20;
      return Math.min(score, 100);
    },
  },
];

const QUESTION_SETS: QuestionSet[] = [
  {
    phase: "hpi",
    questions: [
      { id: "Q_GU_01", text: "Do you have pain or burning when you urinate?", type: "yesno", extractKey: "dysuria", required: true },
      { id: "Q_GU_02", text: "Are you urinating more often than usual?", type: "yesno", extractKey: "frequency", required: true },
      { id: "Q_GU_03", text: "Do you feel a strong, sudden urge to urinate?", type: "yesno", extractKey: "urgency", required: true },
      { id: "Q_GU_04", text: "Is there any blood in your urine (pink, red, or brown)?", type: "yesno", extractKey: "hematuria", required: true },
      { id: "Q_GU_05", text: "Any pain in your back or side, just below your ribs?", type: "yesno", extractKey: "flank_pain", required: true },
      { id: "Q_GU_06", text: "Do you have fever or chills?", type: "yesno", extractKey: "fever", required: true },
      { id: "Q_GU_07", text: "How many days have these symptoms been present?", type: "scale", extractKey: "symptom_days", required: true },
    ],
  },
  {
    phase: "ros",
    questions: [
      { id: "Q_GU_08", text: "Any nausea or vomiting?", type: "yesno", extractKey: "nausea_vomiting", required: false },
      { id: "Q_GU_09", text: "Any discharge from the urethra or vagina?", type: "yesno", extractKey: "discharge", required: false },
      { id: "Q_GU_10", text: "Any pelvic or lower abdominal pain?", type: "yesno", extractKey: "pelvic_pain", required: false },
      { id: "Q_GU_11", text: "Is the pain coming in waves (colicky)?", type: "yesno", extractKey: "colicky_pain", required: false },
    ],
  },
  {
    phase: "pmh",
    questions: [
      { id: "Q_GU_12", text: "Have you had a UTI or kidney infection before? How many times in the past year?", type: "open", extractKey: "prior_uti_count", required: true },
      { id: "Q_GU_13", text: "Are you currently pregnant or could you be pregnant?", type: "yesno", extractKey: "pregnant", required: true, condition: s => s.sex === "female" },
      { id: "Q_GU_14", text: "Do you have diabetes, kidney disease, or a urologic condition?", type: "yesno", extractKey: "urologic_comorbidity", required: false },
      { id: "Q_GU_15", text: "Any recent new sexual partners?", type: "yesno", extractKey: "new_sexual_partner", required: false },
      { id: "Q_GU_16", text: "Do you have a urinary catheter?", type: "yesno", extractKey: "catheter", required: false },
    ],
  },
  {
    phase: "safety",
    questions: [
      { id: "Q_GU_17", text: "Are you having trouble urinating or not able to urinate at all?", type: "yesno", extractKey: "urinary_retention", required: true },
      { id: "Q_GU_18", text: "Do you feel confused or unusually tired/weak?", type: "yesno", extractKey: "confusion", required: true },
    ],
  },
];

const WORKUP_BUNDLES: WorkupBundle[] = [
  {
    id: "WU_GU_UA",
    label: "Urinalysis + Urine Culture",
    tests: ["UA w/ micro", "Urine C&S"],
    indication: () => true,
  },
  {
    id: "WU_GU_PYELO",
    label: "Pyelo / Urosepsis Panel",
    tests: ["CBC", "BMP", "Blood cultures × 2", "Lactate"],
    indication: s => (s.tempF ?? 0) >= 101 && !!(s.symptoms["flank_pain"]),
  },
  {
    id: "WU_GU_IMAGING",
    label: "Renal Ultrasound / CT KUB",
    tests: ["CT Abdomen/Pelvis without contrast (stone protocol)", "Renal ultrasound (if pregnant)"],
    indication: s => !!(s.symptoms["colicky_pain"] || s.symptoms["hematuria"] || s.symptoms["flank_pain"]),
  },
  {
    id: "WU_GU_STI",
    label: "STI Panel",
    tests: ["GC/Chlamydia NAAT", "Wet prep", "RPR", "HIV"],
    indication: s => !!(s.symptoms["discharge"] || s.symptoms["new_sexual_partner"]),
  },
];

const DISPOSITION_RULES: DispositionRule[] = [
  {
    id: "D_GU_01",
    label: "ER Immediate — urosepsis",
    disposition: "ER_IMMEDIATE",
    color: "red",
    priority: 1,
    rationale: "Sepsis criteria met. IV antibiotics and monitoring required.",
    condition: s => RED_FLAGS.find(r => r.id === "RF_GU_007")!.match(s),
  },
  {
    id: "D_GU_02",
    label: "ER Urgent — urinary retention or severe pyelonephritis",
    disposition: "ER_URGENT",
    color: "red",
    priority: 2,
    rationale: "Urinary retention or high-grade pyelonephritis.",
    condition: s => !!(s.symptoms["urinary_retention"]) || ((s.tempF ?? 0) >= 103 && s.symptoms["flank_pain"]),
  },
  {
    id: "D_GU_03",
    label: "Urgent Care Today — complicated UTI or pyelonephritis",
    disposition: "URGENT_CARE_TODAY",
    color: "orange",
    priority: 3,
    rationale: "Complicated UTI (pregnancy, male, fever + flank pain). Same-day evaluation.",
    condition: s => s.pregnant === true || s.sex === "male" || !!(s.symptoms["flank_pain"] && (s.tempF ?? 0) >= 101),
  },
  {
    id: "D_GU_04",
    label: "Urgent Care Today — PID or STI with pelvic involvement",
    disposition: "URGENT_CARE_TODAY",
    color: "orange",
    priority: 4,
    rationale: "Pelvic inflammatory disease or STI with adnexal tenderness requires same-day GYN evaluation and empiric treatment.",
    condition: s => !!(s.symptoms["adnexal_tenderness"] || (s.symptoms["discharge"] && (s.symptoms["stdRisk"] || s.symptoms["std_risk"]))),
  },
  {
    id: "D_GU_05",
    label: "Telehealth — uncomplicated UTI in non-pregnant woman",
    disposition: "TELEHEALTH",
    color: "yellow",
    priority: 5,
    rationale: "Uncomplicated lower UTI. Can be managed via telehealth.",
    condition: s => s.sex === "female" && !s.pregnant && !s.symptoms["flank_pain"],
  },
  {
    id: "D_GU_06",
    label: "Primary Care 48h — chronic/recurrent GU concerns",
    disposition: "PRIMARY_CARE_48H",
    color: "green",
    priority: 6,
    rationale: "Subacute or recurrent GU symptoms needing work-up.",
    condition: () => true,
  },
];

const MEDICATION_GROUPS: MedicationGroup[] = [
  {
    group: "Uncomplicated UTI — Female",
    agents: ["Nitrofurantoin 100mg ER BID × 5d", "TMP-SMX DS BID × 3d (if local resistance < 20%)"],
    indication: "Uncomplicated cystitis in non-pregnant women",
    contraindications: ["CrCl < 30 (nitrofurantoin)", "Sulfa allergy (TMP-SMX)", "G6PD deficiency"],
  },
  {
    group: "Pyelonephritis — Outpatient",
    agents: ["Ciprofloxacin 500mg BID × 7d", "TMP-SMX DS BID × 14d (if susceptible)"],
    indication: "Mild-moderate pyelonephritis, outpatient candidate",
    contraindications: ["Fluoroquinolone allergy", "Severe illness requiring IV"],
  },
  {
    group: "UTI in Pregnancy",
    agents: ["Cephalexin 500mg QID × 7d", "Amoxicillin-clavulanate 500/125mg TID × 7d"],
    indication: "UTI or asymptomatic bacteriuria in pregnancy",
    contraindications: ["Beta-lactam allergy", "Nitrofurantoin near term (>36 wks)"],
  },
  {
    group: "STI — Chlamydia/GC",
    agents: ["Doxycycline 100mg BID × 7d (chlamydia)", "Ceftriaxone 500mg IM × 1 (GC)"],
    indication: "Suspected GC/Chlamydia",
    contraindications: ["Doxycycline in pregnancy"],
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
  if (state.tempF === undefined) gaps.push("Temperature not recorded");
  if (!state.symptoms["ua_done"]) gaps.push("Urinalysis not yet obtained");

  return {
    complaintId: state.complaintId,
    disposition: dispositionRule.disposition,
    dispositionColor: dispositionRule.color,
    dispositionLabel: dispositionRule.label,
    rationale: dispositionRule.rationale,
    topDifferentials: scored.slice(0, 5),
    redFlagsTriggered: triggered.map(rf => rf.label),
    workupRecommended: workup,
    medicationsToConsider: scored[0]?.id === "DX_GU_SIMPLE_UTI" ? MEDICATION_GROUPS[0].agents : [],
    criticalGaps: gaps,
    scores: state.scores,
    computedAt: new Date().toISOString(),
  };
}

export const GUUTIPack: ComplaintPack = {
  id: "gu_uti_symptoms",
  displayName: "GU / UTI Symptoms",
  icd10Primary: "N30.00",
  redFlags: RED_FLAGS,
  differentials: DIFFERENTIALS,
  questionSets: QUESTION_SETS,
  workupBundles: WORKUP_BUNDLES,
  dispositionRules: DISPOSITION_RULES,
  medicationGroups: MEDICATION_GROUPS,
  computeTriage,
};

// ─── Named export for golden case validation ──────────────────────────────────
export function assessGU(input: ValidationInput): TriageResult {
  return GUUTIPack.computeTriage(buildStateFromInput(input, "gu_uti_symptoms", "UTI symptoms"));
}
