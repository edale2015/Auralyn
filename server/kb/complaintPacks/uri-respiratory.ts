/**
 * uri-respiratory.ts
 * Complaint Pack: URI / Respiratory (sore_throat, cough, ent_sinus_pressure, earache, pulm_shortness_of_breath)
 * Handles: viral URI, strep pharyngitis, mono, peritonsillar abscess, COVID, pneumonia, asthma, COPD exacerbation
 */

import type {
  ComplaintPack, ExtractedClinicalState, TriageResult,
  RedFlagCriteria, Differential, QuestionSet, WorkupBundle,
  DispositionRule, MedicationGroup
} from "./types";

// ─── Red Flags ───────────────────────────────────────────────────────────────

const RED_FLAGS: RedFlagCriteria[] = [
  {
    id: "RF_URI_001",
    label: "O2 sat < 92%",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "R09.02",
    match: s => (s.o2Sat ?? 99) < 92,
  },
  {
    id: "RF_URI_002",
    label: "Stridor / inability to swallow / drooling",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "J05.10",
    match: s => !!(s.symptoms["stridor"] || s.symptoms["drooling"] || s.symptoms["unable_to_swallow"]),
  },
  {
    id: "RF_URI_003",
    label: "Neck stiffness + fever (meningism)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "G03.9",
    match: s => !!(s.symptoms["neck_stiffness"] && ((s.tempF ?? 0) >= 100.4 || s.symptoms["fever"])),
  },
  {
    id: "RF_URI_004",
    label: "Temp ≥ 104°F",
    severity: "high",
    action: "ER_URGENT",
    icd10: "R50.9",
    match: s => (s.tempF ?? 0) >= 104,
  },
  {
    id: "RF_URI_005",
    label: "Uvula deviation / unilateral peritonsillar swelling",
    severity: "high",
    action: "ER_URGENT",
    icd10: "J36",
    match: s => !!(s.symptoms["uvula_deviation"] || s.symptoms["peritonsillar_swelling"]),
  },
  {
    id: "RF_URI_006",
    label: "Respiratory rate ≥ 28",
    severity: "high",
    action: "ER_URGENT",
    icd10: "R06.00",
    match: s => (s.rrBreaths ?? 0) >= 28,
  },
  {
    id: "RF_URI_007",
    label: "Suspected epiglottitis (tripod positioning, muffled voice)",
    severity: "critical",
    action: "ER_IMMEDIATE",
    icd10: "J05.10",
    match: s => !!(s.symptoms["muffled_voice"] && s.symptoms["difficulty_breathing"] && s.symptoms["drooling"]),
  },
  {
    id: "RF_URI_008",
    label: "Hemoptysis ≥ 1 tsp",
    severity: "high",
    action: "ER_URGENT",
    icd10: "R04.2",
    match: s => !!(s.symptoms["hemoptysis"]),
  },
];

// ─── Differentials ────────────────────────────────────────────────────────────

const DIFFERENTIALS: Differential[] = [
  {
    id: "DX_URI_VIRAL",
    name: "Viral Upper Respiratory Infection",
    icd10: "J06.9",
    cannotMiss: false,
    dispositionIfLikely: "HOME_CARE",
    criteria: s => {
      let score = 30;
      if (s.symptoms["runny_nose"])   score += 20;
      if (s.symptoms["sore_throat"])  score += 10;
      if (s.symptoms["cough"])        score += 10;
      if ((s.tempF ?? 0) < 101)       score += 10;
      if (s.symptoms["contacts_sick"]) score += 10;
      if (!s.symptoms["exudates"])    score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_STREP",
    name: "Streptococcal Pharyngitis",
    icd10: "J02.0",
    cannotMiss: false,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      // Modified Centor score
      let centor = 0;
      if (s.symptoms["exudates"])           centor++;
      if (s.symptoms["tender_anterior_nodes"]) centor++;
      if ((s.tempF ?? 0) >= 100.4)          centor++;
      if (!s.symptoms["cough"])             centor++;
      if ((s.ageYears ?? 30) < 15)          centor++;
      if ((s.ageYears ?? 30) >= 45)         centor--;
      return Math.max(0, Math.min(centor * 20 + 20, 100));
    },
  },
  {
    id: "DX_URI_MONO",
    name: "Infectious Mononucleosis",
    icd10: "B27.90",
    cannotMiss: false,
    dispositionIfLikely: "PRIMARY_CARE_48H",
    criteria: s => {
      let score = 0;
      if (s.symptoms["exudates"])          score += 25;
      if (s.symptoms["splenomegaly"])      score += 30;
      if (s.symptoms["cervical_nodes"])    score += 20;
      if ((s.ageYears ?? 30) < 30)         score += 15;
      if (s.symptoms["fatigue_severe"])    score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_PERITONSILLAR",
    name: "Peritonsillar Abscess",
    icd10: "J36",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.symptoms["uvula_deviation"])        score += 40;
      if (s.symptoms["trismus"])                score += 30;
      if (s.symptoms["muffled_voice"])          score += 20;
      if ((s.tempF ?? 0) >= 101)                score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_PNEUMONIA",
    name: "Community-Acquired Pneumonia",
    icd10: "J18.9",
    cannotMiss: true,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.symptoms["productive_cough"])   score += 25;
      if ((s.tempF ?? 0) >= 101)            score += 20;
      if (s.symptoms["pleuritic_pain"])     score += 20;
      if ((s.o2Sat ?? 99) < 95)             score += 25;
      if (s.symptoms["crackles"])           score += 20;
      if (s.comorbidities.includes("asthma") || s.comorbidities.includes("copd")) score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_ASTHMA",
    name: "Asthma Exacerbation",
    icd10: "J45.901",
    cannotMiss: true,
    dispositionIfLikely: "URGENT_CARE_TODAY",
    criteria: s => {
      let score = 0;
      if (s.comorbidities.includes("asthma"))    score += 30;
      if (s.symptoms["wheezing"])                score += 30;
      if (s.symptoms["dyspnea_exertion"])        score += 20;
      if ((s.o2Sat ?? 99) < 95)                  score += 20;
      if (s.symptoms["rescue_inhaler_overuse"])  score += 15;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_COPD",
    name: "COPD Exacerbation",
    icd10: "J44.1",
    cannotMiss: true,
    dispositionIfLikely: "ER_URGENT",
    criteria: s => {
      let score = 0;
      if (s.comorbidities.includes("copd"))         score += 35;
      if (s.smokingStatus === "current" || s.smokingStatus === "former") score += 20;
      if (s.symptoms["increased_sputum"])            score += 20;
      if (s.symptoms["dyspnea_rest"])                score += 25;
      if ((s.ageYears ?? 0) > 50)                    score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_COVID",
    name: "COVID-19",
    icd10: "U07.1",
    cannotMiss: false,
    dispositionIfLikely: "HOME_CARE",
    criteria: s => {
      let score = 20;
      if (s.symptoms["anosmia"] || s.symptoms["ageusia"]) score += 30;
      if (s.symptoms["myalgias"])   score += 15;
      if (s.symptoms["fatigue"])    score += 10;
      if (s.symptoms["contacts_sick"]) score += 15;
      if ((s.tempF ?? 0) >= 100.4)  score += 10;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_SINUSITIS",
    name: "Acute Bacterial Sinusitis",
    icd10: "J01.90",
    cannotMiss: false,
    dispositionIfLikely: "TELEHEALTH",
    criteria: s => {
      let score = 0;
      if (s.symptoms["facial_pain_pressure"]) score += 30;
      if (s.symptoms["nasal_congestion"])     score += 20;
      if (s.symptoms["purulent_discharge"])   score += 30;
      if (Number(s.symptoms["symptom_days"] ?? 0) >= 10) score += 20;
      return Math.min(score, 100);
    },
  },
  {
    id: "DX_URI_OTITIS",
    name: "Acute Otitis Media",
    icd10: "H66.90",
    cannotMiss: false,
    dispositionIfLikely: "TELEHEALTH",
    criteria: s => {
      let score = 0;
      if (s.symptoms["ear_pain"])         score += 40;
      if (s.symptoms["ear_fullness"])     score += 20;
      if (s.symptoms["hearing_reduced"]) score += 15;
      if ((s.tempF ?? 0) >= 100.4)        score += 15;
      if ((s.ageYears ?? 30) < 10)        score += 10;
      return Math.min(score, 100);
    },
  },
];

// ─── Question Sets ────────────────────────────────────────────────────────────

const QUESTION_SETS: QuestionSet[] = [
  {
    phase: "hpi",
    questions: [
      { id: "Q_URI_01", text: "How many days have you had these symptoms?", type: "scale", extractKey: "symptom_days", required: true },
      { id: "Q_URI_02", text: "Do you have a fever or feel feverish?", type: "yesno", extractKey: "fever", required: true },
      { id: "Q_URI_03", text: "Do you have a sore throat?", type: "yesno", extractKey: "sore_throat", required: true },
      { id: "Q_URI_04", text: "Do you have a cough? If yes, is it dry or producing mucus?", type: "multichoice", options: ["No cough", "Dry cough", "Wet/productive cough"], extractKey: "cough_type", required: true },
      { id: "Q_URI_05", text: "Any trouble breathing or shortness of breath?", type: "yesno", extractKey: "difficulty_breathing", required: true },
      { id: "Q_URI_06", text: "Do you have white patches or pus on your tonsils?", type: "yesno", extractKey: "exudates", required: false },
      { id: "Q_URI_07", text: "Any runny or stuffy nose?", type: "yesno", extractKey: "nasal_congestion", required: false },
      { id: "Q_URI_08", text: "Any ear pain?", type: "yesno", extractKey: "ear_pain", required: false },
      { id: "Q_URI_09", text: "Any facial pain or pressure around your cheeks and forehead?", type: "yesno", extractKey: "facial_pain_pressure", required: false },
      { id: "Q_URI_10", text: "Have you lost your sense of smell or taste?", type: "yesno", extractKey: "anosmia", required: false },
    ],
  },
  {
    phase: "ros",
    questions: [
      { id: "Q_URI_11", text: "Any neck stiffness or pain when you move your head forward?", type: "yesno", extractKey: "neck_stiffness", required: true },
      { id: "Q_URI_12", text: "Any drooling or difficulty swallowing?", type: "yesno", extractKey: "drooling", required: true },
      { id: "Q_URI_13", text: "Any wheezing or chest tightness?", type: "yesno", extractKey: "wheezing", required: false },
      { id: "Q_URI_14", text: "Any muscle aches or body pain?", type: "yesno", extractKey: "myalgias", required: false },
      { id: "Q_URI_15", text: "Anyone around you sick recently with similar symptoms?", type: "yesno", extractKey: "contacts_sick", required: false },
    ],
  },
  {
    phase: "pmh",
    questions: [
      { id: "Q_URI_16", text: "Do you have asthma or COPD?", type: "yesno", extractKey: "pmh_pulm", required: true },
      { id: "Q_URI_17", text: "Are you on any inhalers? Have you needed to use them more than usual?", type: "yesno", extractKey: "rescue_inhaler_overuse", required: false, condition: s => !!(s.symptoms["pmh_pulm"]) },
      { id: "Q_URI_18", text: "Are you a smoker?", type: "multichoice", options: ["Never", "Former", "Current"], extractKey: "smoking", required: false },
      { id: "Q_URI_19", text: "Are you immunocompromised (HIV, chemotherapy, steroids)?", type: "yesno", extractKey: "immunocompromised", required: true },
    ],
  },
  {
    phase: "safety",
    questions: [
      { id: "Q_URI_20", text: "Are you having any trouble breathing right now — feeling like you cannot get a full breath?", type: "yesno", extractKey: "dyspnea_rest", required: true },
      { id: "Q_URI_21", text: "Do you have any rash, especially a widespread red rash?", type: "yesno", extractKey: "rash", required: false },
    ],
  },
];

// ─── Workup Bundles ───────────────────────────────────────────────────────────

const WORKUP_BUNDLES: WorkupBundle[] = [
  {
    id: "WU_URI_RAPID_STREP",
    label: "Rapid Strep Test",
    tests: ["Rapid Strep Antigen"],
    indication: s => {
      const centor = [s.symptoms["exudates"], s.symptoms["tender_anterior_nodes"], (s.tempF ?? 0) >= 100.4, !s.symptoms["cough"]].filter(Boolean).length;
      return centor >= 2;
    },
  },
  {
    id: "WU_URI_MONO",
    label: "Mono Spot / EBV Panel",
    tests: ["Monospot", "EBV IgM/IgG"],
    indication: s => !!(s.symptoms["splenomegaly"] || (s.symptoms["exudates"] && (s.ageYears ?? 30) < 30 && s.symptoms["fatigue_severe"])),
  },
  {
    id: "WU_URI_CXR",
    label: "Chest X-Ray",
    tests: ["PA & Lateral CXR"],
    indication: s => (s.o2Sat ?? 99) < 95 || (s.rrBreaths ?? 0) >= 24 || s.symptoms["productive_cough"] && (s.tempF ?? 0) >= 101,
  },
  {
    id: "WU_URI_OXIMETRY",
    label: "Pulse Oximetry",
    tests: ["SpO2"],
    indication: s => !!(s.symptoms["difficulty_breathing"] || s.symptoms["wheezing"] || s.comorbidities.includes("copd") || s.comorbidities.includes("asthma")),
  },
  {
    id: "WU_URI_COVID",
    label: "COVID-19 Rapid Test",
    tests: ["COVID-19 Antigen"],
    indication: s => !!(s.symptoms["anosmia"] || s.symptoms["fever"] || s.symptoms["contacts_sick"]),
  },
  {
    id: "WU_URI_CBC",
    label: "CBC with Differential",
    tests: ["CBC w/ diff", "CMP"],
    indication: s => (s.tempF ?? 0) >= 102 || s.immunocompromised === true,
  },
];

// ─── Disposition Rules ────────────────────────────────────────────────────────

const DISPOSITION_RULES: DispositionRule[] = [
  {
    id: "D_URI_01",
    label: "ER Immediate — critical red flag",
    disposition: "ER_IMMEDIATE",
    color: "red",
    priority: 1,
    rationale: "Airway compromise, meningism, or critical hypoxia detected.",
    condition: s => RED_FLAGS.filter(rf => rf.severity === "critical").some(rf => rf.match(s)),
  },
  {
    id: "D_URI_02",
    label: "ER Urgent — high-risk red flag",
    disposition: "ER_URGENT",
    color: "red",
    priority: 2,
    rationale: "High fever, peritonsillar abscess, or severe hypoxia.",
    condition: s => RED_FLAGS.filter(rf => rf.severity === "high").some(rf => rf.match(s)),
  },
  {
    id: "D_URI_03",
    label: "Urgent Care Today — possible pneumonia or strep",
    disposition: "URGENT_CARE_TODAY",
    color: "orange",
    priority: 3,
    rationale: "Likely pneumonia or strep requiring same-day evaluation.",
    condition: s => {
      const pneumoniaScore = DIFFERENTIALS.find(d => d.id === "DX_URI_PNEUMONIA")!.criteria(s);
      const strepScore     = DIFFERENTIALS.find(d => d.id === "DX_URI_STREP")!.criteria(s);
      return pneumoniaScore >= 60 || strepScore >= 60;
    },
  },
  {
    id: "D_URI_04",
    label: "Telehealth within 24h — probable viral URI or sinusitis",
    disposition: "TELEHEALTH",
    color: "yellow",
    priority: 4,
    rationale: "Symptoms consistent with viral URI or uncomplicated sinusitis.",
    condition: s => {
      const viralScore = DIFFERENTIALS.find(d => d.id === "DX_URI_VIRAL")!.criteria(s);
      return viralScore >= 50;
    },
  },
  {
    id: "D_URI_05",
    label: "Home Care — mild viral URI",
    disposition: "HOME_CARE",
    color: "green",
    priority: 5,
    rationale: "Mild symptoms consistent with self-limited viral illness.",
    condition: () => true,
  },
];

// ─── Medication Groups ────────────────────────────────────────────────────────

const MEDICATION_GROUPS: MedicationGroup[] = [
  {
    group: "Strep — First-Line Antibiotics",
    agents: ["Amoxicillin 500mg TID × 10d", "Penicillin VK 500mg BID × 10d"],
    indication: "Confirmed or probable streptococcal pharyngitis",
    contraindications: ["Penicillin allergy"],
  },
  {
    group: "Strep — PCN-Allergic",
    agents: ["Azithromycin 500mg day1 then 250mg × 4d", "Cephalexin 500mg BID × 10d (if no anaphylaxis)"],
    indication: "Strep pharyngitis with PCN allergy",
    contraindications: ["Anaphylaxis to cephalosporins"],
  },
  {
    group: "Asthma Exacerbation",
    agents: ["Albuterol 2.5mg neb q20min × 3", "Prednisone 40mg daily × 5d", "Ipratropium 0.5mg neb (moderate-severe)"],
    indication: "Acute asthma exacerbation",
    contraindications: [],
  },
  {
    group: "Sinusitis",
    agents: ["Amoxicillin-Clavulanate 875/125mg BID × 5-7d"],
    indication: "Acute bacterial sinusitis (≥10d or worsening after 5d)",
    contraindications: ["PCN allergy"],
  },
  {
    group: "Symptomatic Relief",
    agents: ["Acetaminophen 650mg q6h PRN", "Ibuprofen 400mg q8h with food", "Guaifenesin 400mg q4h", "Saline nasal spray"],
    indication: "Symptom management for viral URI",
    contraindications: ["Renal disease (NSAIDs)", "GI bleed history (NSAIDs)"],
  },
];

// ─── Compute Triage ───────────────────────────────────────────────────────────

function computeTriage(state: ExtractedClinicalState): TriageResult {
  // Score all differentials
  const scored = DIFFERENTIALS.map(d => ({
    id: d.id,
    name: d.name,
    icd10: d.icd10,
    score: d.criteria(state),
    cannotMiss: d.cannotMiss,
  })).sort((a, b) => b.score - a.score);

  // Check red flags
  const triggered = RED_FLAGS.filter(rf => rf.match(state));

  // Apply disposition rules in priority order
  let dispositionRule = DISPOSITION_RULES.find(r => r.condition(state))!;

  // Workup
  const workup = WORKUP_BUNDLES.filter(wb => wb.indication(state)).flatMap(wb => wb.tests);

  // Medications — top differential-driven
  const topDx = scored[0]?.id ?? "";
  let meds: string[] = [];
  if (topDx === "DX_URI_STREP") meds = MEDICATION_GROUPS[0].agents;
  else if (topDx === "DX_URI_ASTHMA") meds = MEDICATION_GROUPS[2].agents;
  else if (topDx === "DX_URI_SINUSITIS") meds = MEDICATION_GROUPS[3].agents;
  else meds = MEDICATION_GROUPS[4].agents;

  // Critical gaps
  const gaps: string[] = [];
  if (state.o2Sat === undefined) gaps.push("O2 saturation not measured");
  if (state.tempF === undefined) gaps.push("Temperature not recorded");
  if (!state.symptoms["exudates"] && scored.find(d => d.id === "DX_URI_STREP" && d.score > 50)) {
    gaps.push("Throat exam needed for exudate assessment");
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
    medicationsToConsider: meds,
    criticalGaps: gaps,
    scores: state.scores,
    computedAt: new Date().toISOString(),
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const URIRespiratoryPack: ComplaintPack = {
  id: "uri_respiratory",
  displayName: "URI / Respiratory",
  icd10Primary: "J06.9",
  redFlags: RED_FLAGS,
  differentials: DIFFERENTIALS,
  questionSets: QUESTION_SETS,
  workupBundles: WORKUP_BUNDLES,
  dispositionRules: DISPOSITION_RULES,
  medicationGroups: MEDICATION_GROUPS,
  computeTriage,
};
