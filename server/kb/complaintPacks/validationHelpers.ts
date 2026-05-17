/**
 * AURALYN — Validation Helpers
 *
 * Converts the "human-readable" test input format used in golden case validation
 * into ExtractedClinicalState consumed by ComplaintPack.computeTriage().
 *
 * Test inputs use: { symptoms, history, vitals, examFindings, tests }
 * ExtractedClinicalState uses: flat symptoms Record + top-level vitals
 *
 * File: server/kb/complaintPacks/validationHelpers.ts
 */

import type { ExtractedClinicalState } from "./types";

export interface ValidationInput {
  symptoms?:    Record<string, any>;
  history?:     Record<string, any>;
  vitals?:      Record<string, any>;
  examFindings?: Record<string, any>;
  tests?:       Record<string, any>;
}

// ─── camelCase → snake_case ───────────────────────────────────────────────────

function toSnake(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}

// ─── Known field aliases (camelCase input → snake_case pack field) ─────────────

const ALIASES: Record<string, string[]> = {
  // Headache
  jawClaudicaton:      ["jaw_claudication", "jaw_claudication"],   // typo in golden cases
  jawClaudication:     ["jaw_claudication"],
  temporalHeadache:    ["temporal_headache", "temporal_pain"],
  // GU
  urinaryFrequency:    ["frequency", "urinary_frequency"],
  urinaryUrgency:      ["urgency", "urinary_urgency"],
  severeCVAtenderness: ["cvat", "cva_tenderness", "flank_pain"],   // CVA tenderness = flank_pain for red flag
  vaginalDischarge:    ["discharge"],
  adnexalTenderness:   ["adnexal_tenderness"],
  // Headache
  worstHeadacheOfLife: ["worst_ever", "worst_headache_of_life"],
  suddenOnsetMaximum:  ["thunderclap", "sudden_onset"],
  neckStiffness:       ["neck_stiffness"],
  temporalHeadache:    ["temporal_headache"],
  jawClaudicaton:      ["jaw_claudication"],
  frontalLocation:     ["frontal_location"],
  pulsatingQuality:    ["pulsating_quality"],
  photophobia:         ["photophobia"],
  nausea:              ["nausea", "nausea_vomiting"],
  focalWeakness:       ["focal_neuro", "focal_weakness"],
  speechDifficulty:    ["speech_difficulty"],
  visionChanges:       ["vision_changes"],
  priorMigraineHistory:["prior_headache_hx", "prior_migraine_history"],
  // Abdominal
  peritonealSigns:     ["rigidity", "rebound_tenderness", "peritoneal_signs"],
  abdominalRigidity:   ["rigidity"],
  reboundTenderness:   ["rebound_tenderness"],
  boardLikeAbdomen:    ["rigidity", "board_like"],
  ttpRLQ:              ["rlq_pain"],
  ttpSeverity:         ["ttp_severity"],
  ttpPresent:          ["ttp_present"],
  backPain:            ["back_pain", "sudden_severe_pain"],
  painLocation:        ["pain_location", "acute_abdominal_pain"],
  // MSK
  bonyTenderness:      ["bony_tenderness"],
  jointSwelling:       ["joint_swelling"],
  bowelBladderDysfunction: ["bowel_bladder_dysfunction"],
  inabilityToBearWeight:   ["inability_to_bear_weight"],
  saddleAnesthesia:    ["saddle", "saddle_anesthesia"],
  // Derm
  rashWithFever:       ["rash_with_fever"],
  mucosalInvolvement:  ["mucosal_involvement"],
  rapidlySpreading:    ["rapidly_spreading"],
  skinNecrosis:        ["skin_necrosis"],
  hivesFacial:         ["hives_facial"],
  centralClearing:     ["central_clearing"],
  silveryScale:        ["silvery_scale"],
  wellDemarcatedRed:   ["well_demarcated_red"],
  painfulRash:         ["painful_rash"],
  // Psych
  passiveIdeation:     ["passive_ideation"],
  activeIdeation:      ["active_ideation"],
  activePlan:          ["active_plan"],
  homicidalIdeation:   ["homicidal_ideation"],
  decreasedSleepNeed:  ["decreased_sleep_need"],
  racingThoughts:      ["racing_thoughts"],
  alteredMentalStatus: ["altered_mental_status"],
  disorganizedSpeech:  ["disorganized_speech"],
  priorAttempt:        ["prior_attempt"],
  knownPsychDx:        ["known_psych_dx"],
  // Chest pain specific
  typicalChestPain:    ["chest_pain", "chest_tightness", "classic_acs_history"],
  classicACSHistory:   ["classic_acs_history"],
  // URI/Respiratory
  sorethroat:          ["sorethroat", "sore_throat"],
  tonsilllarExudate:   ["tonsilllar_exudate", "exudate"],
  tenderAnteriorNodes: ["tender_anterior_nodes", "anterior_lymphadenopathy"],
  nocturnalCough:      ["nocturnal_cough"],
  productivePhlegm:    ["productive_phlegm", "productive_cough"],
  symptomDuration:     ["symptom_duration"],
  albuterolUsagePerDay:["albuterol_usage_per_day"],
  // Vitals (can appear in symptoms)
  fever:               ["fever"],
};

// ─── Main converter ───────────────────────────────────────────────────────────

export function buildStateFromInput(
  input: ValidationInput,
  complaintId: string,
  chiefComplaint: string
): ExtractedClinicalState {
  const hist     = input.history     ?? {};
  const vitals   = input.vitals      ?? {};
  const exam     = input.examFindings ?? {};
  const tests    = input.tests       ?? {};
  const rawSyms  = input.symptoms    ?? {};

  const allSymptoms: Record<string, any> = {};

  // ── Pass raw symptoms through (both as-is and snake_case) ─────────────────
  for (const [k, v] of Object.entries(rawSyms)) {
    allSymptoms[k]         = v;
    allSymptoms[toSnake(k)] = v;
    // Apply aliases
    for (const alias of ALIASES[k] ?? []) {
      allSymptoms[alias] = v;
    }
  }

  // ── Special semantic mappings (value-based) ────────────────────────────────
  const pq = rawSyms["painQuality"];
  if (pq === "tearing" || pq === "ripping") {
    allSymptoms["tearing_pain"] = true;
    allSymptoms["ripping_pain"] = true;
  }
  if (pq === "pressure" || pq === "squeezing" || pq === "crushing") {
    allSymptoms["classic_acs_history"] = true;
    allSymptoms["chest_pain"]          = allSymptoms["chest_pain"] ?? true;
  }

  // ── examFindings: flatten nested objects ───────────────────────────────────
  for (const [k, v] of Object.entries(exam)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      // e.g. ekg: { stElevation: true } → ecg_st_elevation: true, st_elevation: true
      for (const [nk, nv] of Object.entries(v)) {
        allSymptoms[`${k}_${nk}`]                   = nv;
        allSymptoms[`${toSnake(k)}_${toSnake(nk)}`] = nv;
        allSymptoms[toSnake(nk)]                     = nv;
            // Specific EKG aliases
        if (k === "ekg" && nk === "stElevation" && nv) {
          allSymptoms["ecg_st_elevation"] = true;
          allSymptoms["ecg_st_changes"]   = true;   // HEART score E-component
          allSymptoms["st_elevation"]     = true;
        }
        if (k === "ekg" && nk === "lbbb" && nv) allSymptoms["ecg_lbbb"] = true;
        if (k === "ekg" && nk === "normal" && nv) allSymptoms["ekg_normal"] = true;
      }
    } else {
      allSymptoms[k]          = v;
      allSymptoms[toSnake(k)] = v;
      for (const alias of ALIASES[k] ?? []) {
        allSymptoms[alias] = v;
      }
    }
  }

  // ── tests: UA special handling ─────────────────────────────────────────────
  if (tests.ua) {
    allSymptoms["ua_done"] = true;
    if (tests.ua.leukocytes)        allSymptoms["pyuria"]                  = true;
    if (tests.ua.nitrites)          allSymptoms["bacteriuria"]             = true;
    if (tests.ua.blood)             allSymptoms["hematuria"]               = true;
    if (tests.ua.pregnancyNegative) allSymptoms["pregnancy_test_negative"] = true;
  }
  if (tests.strepNegative)  allSymptoms["strep_negative"]  = true;
  if (tests.strepPositive)  allSymptoms["strep_positive"]  = true;
  if (tests.fluNegative)    allSymptoms["flu_negative"]    = true;
  if (tests.covidNegative)  allSymptoms["covid_negative"]  = true;
  if (Array.isArray(tests.cxrFindings)) {
    for (const finding of tests.cxrFindings) {
      allSymptoms[`cxr_${finding.replace(/\s+/g, "_")}`] = true;
      if (finding === "infiltrate") allSymptoms["cxr_infiltrate"] = true;
    }
  }

  // ── History → comorbidities ────────────────────────────────────────────────
  const comorbidities: string[] = [];
  const COMORBIDITY_FLAGS: [string, string][] = [
    ["diabetes",          "diabetes"],
    ["hypertension",      "hypertension"],
    ["hyperlipidemia",    "hyperlipidemia"],
    ["asthma",            "asthma"],
    ["atrialFibrillation","atrial_fibrillation"],
    ["cancerHistory",     "cancer"],
    ["osteoporosis",      "osteoporosis"],
    ["goutHistory",       "gout"],
    ["priorHerniaRepair", "prior_hernia_repair"],
  ];
  for (const [key, label] of COMORBIDITY_FLAGS) {
    if (hist[key]) comorbidities.push(label);
  }
  if (hist.smoker) comorbidities.push("smoking");

  // ── Vitals ─────────────────────────────────────────────────────────────────
  const tempF    = vitals.temp ?? vitals.tempF;
  const hrBpm    = vitals.heartRate ?? vitals.hrBpm;
  const o2Sat    = vitals.o2Sat ?? vitals.spO2;
  const sbp      = vitals.bp?.systolic ?? vitals.sbp;
  const dbp      = vitals.bp?.diastolic ?? vitals.dbp;

  if (vitals.fever || (tempF && tempF >= 100.4)) allSymptoms["fever"] = true;

  // Normalize sex/gender
  const sexRaw: string | undefined = hist.sex ?? hist.genderIdentity ?? hist.biologicalSex;
  const sex: "male" | "female" | undefined =
    sexRaw === "male"   || sexRaw === "man"   || sexRaw === "M" ? "male"   :
    sexRaw === "female" || sexRaw === "woman" || sexRaw === "F" ||
    hist.hasCervix === true                                      ? "female" : undefined;

  return {
    complaintId,
    chiefComplaint,
    ageYears:      hist.age,
    sex,
    pregnant:      hist.pregnant,
    immunocompromised: hist.immunocompromised,
    tempF,
    hrBpm,
    o2Sat,
    sbp,
    dbp,
    symptoms:      allSymptoms,
    comorbidities,
    currentMeds:   hist.medications ?? hist.currentMedications ?? [],
    allergies:     hist.medicationAllergies ?? [],
    smokingStatus: hist.smoker ? "current" : undefined,
    answerLog:     [],
    scores:        {},
  };
}
