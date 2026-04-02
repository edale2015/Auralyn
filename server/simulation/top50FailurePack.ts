import type { SimulationCase } from "./simulationCaseFactory";

export type Top50Pack =
  | "misleading"
  | "missing_data"
  | "conflicting"
  | "modifier_heavy"
  | "disposition_edge";

export interface Top50Case extends SimulationCase {
  pack: Top50Pack;
  packLabel: string;
  clinicalNote: string;
  tags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK 1 — MISLEADING PRESENTATIONS (10)
// Classic cases where surface symptoms mask the true emergency
// ─────────────────────────────────────────────────────────────────────────────
function misleadingPack(): Top50Case[] {
  return [
    {
      caseId: "p1-m1", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "chest_pain", age: 45, sex: "female", difficulty: "hard",
      features: { burning: true, epigastric: true, relievedAntacid: false, diaphoresis: true, nausea: true, exertional: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "acute_coronary_syndrome",
      goldFlags: ["diaphoresis", "nausea_with_chest"],
      clinicalNote: "Atypical MI presentation in female — burning chest pain mistaken for GERD",
      tags: ["atypical_mi", "female_mi", "gerd_mimic"],
    },
    {
      caseId: "p1-m2", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "sore_throat", age: 6, sex: "male", difficulty: "hard",
      features: { drooling: true, muffledVoice: true, fever: true, trismus: false, exudate: false, barkyMild: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "epiglottitis",
      goldFlags: ["drooling", "muffled_voice", "pediatric_fever"],
      clinicalNote: "Pediatric epiglottitis — mild-looking sore throat with drooling",
      tags: ["epiglottitis_miss", "pediatric_airway"],
    },
    {
      caseId: "p1-m3", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "dizziness", age: 50, sex: "male", difficulty: "hard",
      features: { palpitations: true, positional: false, anx: true, syncope: false, diaphoresis: true, exertional: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "arrhythmia",
      goldFlags: ["palpitations", "exertional_dizziness", "diaphoresis"],
      clinicalNote: "Arrhythmia labeled anxiety — palpitations + dizziness on exertion",
      tags: ["arrhythmia_missed", "anxiety_mimic"],
    },
    {
      caseId: "p1-m4", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "chest_pain", age: 60, sex: "male", difficulty: "hard",
      features: { tearing: true, sudden: true, radiatesToBack: true, diaphoresis: true, unequal_bp: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "aortic_dissection",
      goldFlags: ["tearing", "radiation_to_back", "sudden_onset"],
      clinicalNote: "Aortic dissection — tearing back pain often misread as musculoskeletal",
      tags: ["aaa_miss", "aortic_dissection"],
    },
    {
      caseId: "p1-m5", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "headache", age: 55, sex: "female", difficulty: "hard",
      features: { worst: true, sudden: true, thunderclap: true, neckStiff: false, nausea: true, photophobia: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "subarachnoid_hemorrhage",
      goldFlags: ["worst_headache_of_life", "thunderclap"],
      clinicalNote: "SAH — 'worst headache of life' without classic meningismus",
      tags: ["subarachnoid_miss", "thunderclap_headache"],
    },
    {
      caseId: "p1-m6", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "fever", age: 70, sex: "female", difficulty: "hard",
      features: { generalFatigue: true, confusion: true, lowGradeOnly: true, noChills: true, alteredMental: true, hr: 110 },
      expectedDisposition: "er_now", expectedTopDiagnosis: "sepsis",
      goldFlags: ["altered_mental_status", "elderly_fever", "tachycardia"],
      clinicalNote: "Sepsis in elderly — low-grade fever, confusion; high-risk missed due to atypical vitals",
      tags: ["sepsis_miss", "elderly_atypical"],
    },
    {
      caseId: "p1-m7", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "breathlessness", age: 38, sex: "female", difficulty: "hard",
      features: { pleuriticPain: true, suddenOnset: true, recentFlight: true, cough: true, sob: true, wheeze: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "pulmonary_embolism",
      goldFlags: ["recent_flight", "pleuritic_pain", "sudden_sob"],
      clinicalNote: "PE misread as anxiety or bronchitis — pleuritic pain + recent flight",
      tags: ["pe_missed", "travel_history"],
    },
    {
      caseId: "p1-m8", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "dizziness", age: 65, sex: "male", difficulty: "hard",
      features: { unilateralWeakness: false, speechChange: false, gaitUnsteady: true, vertigo: true, nystagmus: true, headache: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "cerebellar_stroke",
      goldFlags: ["gait_ataxia", "nystagmus", "headache_with_vertigo"],
      clinicalNote: "Cerebellar stroke masked as BPPV — no focal weakness but ataxia + headache",
      tags: ["stroke_missed", "posterior_circulation"],
    },
    {
      caseId: "p1-m9", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "chest_pain", age: 55, sex: "male", difficulty: "hard",
      features: { epigastric: true, nausea: true, vomiting: true, diaphoresis: true, exertional: false, jawPain: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "acute_coronary_syndrome",
      goldFlags: ["jaw_pain", "diaphoresis", "nausea_vomiting"],
      clinicalNote: "Inferior MI presenting as epigastric pain + nausea — classic missed ACS",
      tags: ["mi_equivalent", "inferior_mi"],
    },
    {
      caseId: "p1-m10", pack: "misleading", packLabel: "Misleading Presentations",
      complaint: "sore_throat", age: 30, sex: "male", difficulty: "hard",
      features: { uvulaDeviation: true, trismus: true, hotPotato: true, exudate: true, fever: true, dysphagia: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "peritonsillar_abscess",
      goldFlags: ["uvula_deviation", "trismus", "hot_potato_voice"],
      clinicalNote: "PTA misread as severe strep — uvula deviation missed at triage",
      tags: ["peritonsillar_abscess", "airway_risk"],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK 2 — MISSING / INCOMPLETE DATA (10)
// Cases that test robustness when information is sparse or absent
// ─────────────────────────────────────────────────────────────────────────────
function missingDataPack(): Top50Case[] {
  return [
    {
      caseId: "p2-md1", pack: "missing_data", packLabel: "Missing Data",
      complaint: "chest_pain", age: 60, sex: "male", difficulty: "hard",
      features: { age: 60 },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "acute_coronary_syndrome",
      goldFlags: [], clinicalNote: "No symptom detail — elderly male with chest pain should still route urgent", tags: ["no_symptoms", "default_escalate"],
    },
    {
      caseId: "p2-md2", pack: "missing_data", packLabel: "Missing Data",
      complaint: "fever", age: 2, sex: "female", difficulty: "hard",
      features: { temperature: 38.8 },
      expectedDisposition: "er_now", expectedTopDiagnosis: "febrile_infant",
      goldFlags: ["infant_fever"], clinicalNote: "Infant under 3 months with fever — no other data → ER always", tags: ["infant_fever", "no_data"],
    },
    {
      caseId: "p2-md3", pack: "missing_data", packLabel: "Missing Data",
      complaint: "breathlessness", age: 72, sex: "male", difficulty: "hard",
      features: { sob: true },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "acute_respiratory_failure",
      goldFlags: ["sob_elderly"], clinicalNote: "Elderly SOB — minimal context still requires urgent evaluation", tags: ["empty_symptoms", "elderly_sob"],
    },
    {
      caseId: "p2-md4", pack: "missing_data", packLabel: "Missing Data",
      complaint: "headache", age: 45, sex: "female", difficulty: "moderate",
      features: {},
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "migraine_or_tension",
      goldFlags: [], clinicalNote: "Headache with zero context — system must prompt for red-flag questions", tags: ["missing_context", "need_more_info"],
    },
    {
      caseId: "p2-md5", pack: "missing_data", packLabel: "Missing Data",
      complaint: "chest_pain", age: 38, sex: "female", difficulty: "hard",
      features: { durationDays: 0 },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "musculoskeletal_or_gerd",
      goldFlags: [], clinicalNote: "Duration null — system must not crash or silently default to safe triage", tags: ["missing_duration", "null_safety"],
    },
    {
      caseId: "p2-md6", pack: "missing_data", packLabel: "Missing Data",
      complaint: "dizziness", age: 68, sex: "male", difficulty: "hard",
      features: {},
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "nonspecific_dizziness",
      goldFlags: [], clinicalNote: "No exam, no history — dizziness in elderly needs urgent default", tags: ["missing_exam", "elderly_dizziness"],
    },
    {
      caseId: "p2-md7", pack: "missing_data", packLabel: "Missing Data",
      complaint: "fever", age: 5, sex: "male", difficulty: "moderate",
      features: { temperature: 39.2 },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "bacterial_infection",
      goldFlags: ["high_fever"], clinicalNote: "High fever in child — no symptom detail → urgent but not ER if no red flags", tags: ["pediatric_fever", "minimal_data"],
    },
    {
      caseId: "p2-md8", pack: "missing_data", packLabel: "Missing Data",
      complaint: "ear_pain", age: 3, sex: "female", difficulty: "easy",
      features: {},
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "otitis_media",
      goldFlags: [], clinicalNote: "Ear pain in toddler — no data → routine urgent care, no self-care default", tags: ["pediatric_ear", "empty_features"],
    },
    {
      caseId: "p2-md9", pack: "missing_data", packLabel: "Missing Data",
      complaint: "sore_throat", age: 25, sex: "male", difficulty: "easy",
      features: {},
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "strep_pharyngitis",
      goldFlags: [], clinicalNote: "Sore throat with no context — Centor unknown → cannot safely route to self-care", tags: ["no_history", "strep_default"],
    },
    {
      caseId: "p2-md10", pack: "missing_data", packLabel: "Missing Data",
      complaint: "cough", age: 55, sex: "female", difficulty: "moderate",
      features: { durationDays: 14 },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "pneumonia",
      goldFlags: ["prolonged_cough"], clinicalNote: "2-week cough with no symptoms → system must escalate, not dismiss", tags: ["subacute_cough", "duration_flag"],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK 3 — CONFLICTING SIGNALS (10)
// Cases where symptoms point in opposite directions
// ─────────────────────────────────────────────────────────────────────────────
function conflictingPack(): Top50Case[] {
  return [
    {
      caseId: "p3-c1", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "chest_pain", age: 28, sex: "male", difficulty: "hard",
      features: { tearing: true, young: true, musculoskeletal: true, positionalRelief: true, diaphoresis: false, htn: false },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "musculoskeletal_or_gerd",
      goldFlags: [], clinicalNote: "Young male with tearing chest — positional relief reduces ACS probability but tearing still needs workup",
      tags: ["age_vs_symptom", "conflicting_triage"],
    },
    {
      caseId: "p3-c2", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "headache", age: 40, sex: "female", difficulty: "hard",
      features: { worst: true, gradual: true, chronicHistory: true, photophobia: true, nausea: true, neckStiff: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "subarachnoid_hemorrhage",
      goldFlags: ["worst_headache_of_life"], clinicalNote: "Chronic migraineur with 'worst' headache — history of migraines should NOT lower ER threshold for thunderclap",
      tags: ["worst_vs_chronic", "sah_risk"],
    },
    {
      caseId: "p3-c3", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "fever", age: 65, sex: "male", difficulty: "hard",
      features: { temperature: 37.8, hr: 115, confusion: true, chronicFever: false, antibioticsToday: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "sepsis",
      goldFlags: ["tachycardia", "altered_mental_status"], clinicalNote: "Low-grade fever already on antibiotics, but confusion + tachycardia → still sepsis until proven otherwise",
      tags: ["abx_masking", "sepsis_atypical"],
    },
    {
      caseId: "p3-c4", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "breathlessness", age: 50, sex: "female", difficulty: "hard",
      features: { anxiety: true, hyperventilation: true, sob: true, saturation: 93, recentFlight: false, pleuriticPain: false },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "asthma_exacerbation",
      goldFlags: ["low_saturation"], clinicalNote: "Looks like panic attack but SpO2 93 — saturation always overrides anxious presentation",
      tags: ["anxiety_vs_hypoxia", "sat_overrides"],
    },
    {
      caseId: "p3-c5", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "cough", age: 55, sex: "male", difficulty: "hard",
      features: { smoker: true, chronicCough: true, hemoptysis: true, durationDays: 30, fever: false, weightLoss: true },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "lung_cancer_vs_infection",
      goldFlags: ["hemoptysis", "weight_loss"], clinicalNote: "Chronic smoker cough with hemoptysis + weight loss — don't diagnose URI", tags: ["hemoptysis", "lung_ca_risk"],
    },
    {
      caseId: "p3-c6", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "dizziness", age: 35, sex: "female", difficulty: "moderate",
      features: { positional: true, nystagmus: false, headache: true, nausea: true, sob: false },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "migraine_associated_vertigo",
      goldFlags: [], clinicalNote: "Positional dizziness + headache — BPPV vs migraine vs posterior fossa needs imaging", tags: ["bppv_vs_migraine", "imaging_needed"],
    },
    {
      caseId: "p3-c7", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "ear_pain", age: 68, sex: "male", difficulty: "hard",
      features: { mastoidTenderness: false, hearingLoss: true, discharge: false, facial_weakness: true, duration: 3 },
      expectedDisposition: "er_now", expectedTopDiagnosis: "malignant_otitis_externa",
      goldFlags: ["facial_weakness", "diabetic_ear"], clinicalNote: "Ear pain + facial nerve involvement in elderly → skull base osteomyelitis risk, not simple OE",
      tags: ["malignant_oe", "cranial_nerve"],
    },
    {
      caseId: "p3-c8", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "fever", age: 22, sex: "female", difficulty: "hard",
      features: { rash: true, petechiae: false, macular: true, headache: true, stiffNeck: false, recentFlu: true },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "viral_exanthem_vs_meningococcemia",
      goldFlags: ["rash_with_fever"], clinicalNote: "Macular rash with fever after flu — viral vs. early bacterial must be distinguished urgently",
      tags: ["rash_fever", "meningococcemia_risk"],
    },
    {
      caseId: "p3-c9", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "chest_pain", age: 67, sex: "female", difficulty: "hard",
      features: { chronicAngina: true, newPattern: true, rest: true, nocturnal: true, responsive: false, exertional: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "unstable_angina",
      goldFlags: ["rest_pain", "new_pattern", "nocturnal"], clinicalNote: "Known angina going unstable — new pattern + rest pain signals ACS despite history",
      tags: ["unstable_angina", "pattern_change"],
    },
    {
      caseId: "p3-c10", pack: "conflicting", packLabel: "Conflicting Signals",
      complaint: "headache", age: 55, sex: "male", difficulty: "hard",
      features: { hypertensive: true, bp: 210, confusion: false, visualChanges: true, nausea: true, worst: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "hypertensive_emergency",
      goldFlags: ["extreme_bp", "visual_changes"], clinicalNote: "Headache + BP 210/120 + visual symptoms → hypertensive emergency regardless of pain severity",
      tags: ["hypertensive_emergency", "end_organ"],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK 4 — MODIFIER-HEAVY CASES (10)
// Age extremes, comorbidities, and medications change the clinical picture
// ─────────────────────────────────────────────────────────────────────────────
function modifierHeavyPack(): Top50Case[] {
  return [
    {
      caseId: "p4-mh1", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "fever", age: 85, sex: "female", difficulty: "hard",
      features: { temperature: 37.5, confusion: true, falls: true, immunocompromised: true, nursingHome: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "sepsis",
      goldFlags: ["elderly_immunocompromised", "confusion"], clinicalNote: "Frail elderly immunocompromised — minimal fever threshold for sepsis", tags: ["frail_elderly", "immunocompromised"],
    },
    {
      caseId: "p4-mh2", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "chest_pain", age: 45, sex: "male", difficulty: "hard",
      features: { cocaine: true, tachycardia: true, hypertension: true, chest: true, sob: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "cocaine_induced_acs",
      goldFlags: ["substance_use", "tachycardia"], clinicalNote: "Cocaine use + chest pain = emergency until ACS ruled out by troponin", tags: ["substance_modifier", "cocaine_acs"],
    },
    {
      caseId: "p4-mh3", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "cough", age: 75, sex: "female", difficulty: "hard",
      features: { immunosuppressed: true, transplant: true, sob: true, durationDays: 5, fever: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "pneumocystis_pneumonia",
      goldFlags: ["immunosuppressed", "transplant_patient"], clinicalNote: "Transplant patient with cough + fever → PCP or opportunistic infection risk", tags: ["immunosuppressed", "pcp_risk"],
    },
    {
      caseId: "p4-mh4", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "headache", age: 70, sex: "male", difficulty: "hard",
      features: { warfarin: true, inr: 4.2, headache: true, vomiting: true, confusion: false, fall: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "intracranial_hemorrhage",
      goldFlags: ["anticoagulated", "high_inr", "fall"], clinicalNote: "Anticoagulated + fall + headache = ICH until head CT clears it", tags: ["anticoagulation", "ich_risk"],
    },
    {
      caseId: "p4-mh5", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "fever", age: 1, sex: "male", difficulty: "hard",
      features: { age: 1, temperature: 38.3, noBacteria: true, noSource: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "febrile_infant",
      goldFlags: ["age_under_3_months"], clinicalNote: "Infant under 3 months with any fever → ER without exception", tags: ["infant_fever", "3_month_rule"],
    },
    {
      caseId: "p4-mh6", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "breathlessness", age: 65, sex: "female", difficulty: "hard",
      features: { pacemakerDependent: true, sob: true, presyncope: true, rate: 35, dizziness: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "pacemaker_failure",
      goldFlags: ["pacemaker_dependent", "bradycardia"], clinicalNote: "Pacemaker-dependent patient with SOB + slow rate → device failure emergency", tags: ["device_failure", "pacemaker"],
    },
    {
      caseId: "p4-mh7", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "chest_pain", age: 52, sex: "male", difficulty: "hard",
      features: { dialysis: true, missed_session: true, sob: true, edema: true, bp: 195 },
      expectedDisposition: "er_now", expectedTopDiagnosis: "hypervolemia_uremia",
      goldFlags: ["dialysis_dependent", "missed_session"], clinicalNote: "Dialysis patient missing session with SOB + edema = fluid overload emergency", tags: ["dialysis", "fluid_overload"],
    },
    {
      caseId: "p4-mh8", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "sore_throat", age: 65, sex: "female", difficulty: "hard",
      features: { neutropenic: true, chemo: true, fever: true, temperature: 38.1, throat: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "neutropenic_sepsis",
      goldFlags: ["neutropenic", "chemo_patient"], clinicalNote: "Neutropenic fever in oncology patient = admission protocol regardless of symptom severity", tags: ["neutropenic_fever", "oncology"],
    },
    {
      caseId: "p4-mh9", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "dizziness", age: 80, sex: "male", difficulty: "hard",
      features: { betablocker: true, calciumBlocker: true, hr: 38, syncope: true, fall: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "drug_induced_bradycardia",
      goldFlags: ["polypharmacy_bradycardia", "syncope"], clinicalNote: "Polypharmacy bradycardia with syncope in elderly — medication interaction emergency", tags: ["polypharmacy", "drug_bradycardia"],
    },
    {
      caseId: "p4-mh10", pack: "modifier_heavy", packLabel: "Modifier-Heavy",
      complaint: "headache", age: 30, sex: "female", difficulty: "moderate",
      features: { pregnant: true, bp: 160, proteinuria: true, edema: true, blurredVision: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "pre_eclampsia_severe",
      goldFlags: ["pregnancy", "severe_hypertension", "proteinuria"], clinicalNote: "Pregnant patient with headache + hypertension = severe pre-eclampsia emergency",
      tags: ["pre_eclampsia", "obstetric_emergency"],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK 5 — DISPOSITION EDGE CASES (10)
// Cases at the exact decision boundary — one feature tips the outcome
// ─────────────────────────────────────────────────────────────────────────────
function dispositionEdgePack(): Top50Case[] {
  return [
    {
      caseId: "p5-d1", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "fever", age: 38, sex: "male", difficulty: "hard",
      features: { temperature: 38.9, malaria_exposure: true, recent_travel: true, chills: true, rigors: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "malaria",
      goldFlags: ["travel_history", "rigors"], clinicalNote: "Moderate-looking fever in traveler from malaria-endemic region → always ER until smear done",
      tags: ["travel_fever", "malaria_risk"],
    },
    {
      caseId: "p5-d2", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "cough", age: 45, sex: "male", difficulty: "hard",
      features: { hiv: true, sob: true, durationDays: 7, fever: true, saturation: 91, productiveCough: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "pneumocystis_pneumonia",
      goldFlags: ["hiv_positive", "low_saturation"], clinicalNote: "HIV + non-productive cough + hypoxia → PCP pneumonia until ruled out by LDH/CXR",
      tags: ["hiv_pcp", "immunocompromised"],
    },
    {
      caseId: "p5-d3", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "ear_pain", age: 70, sex: "male", difficulty: "hard",
      features: { diabetes: true, granuloma: true, otorrhea: true, pain: true, fever: false, facial_weakness: false },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "malignant_otitis_externa",
      goldFlags: ["diabetic_otalgia", "chronic_otorrhea"], clinicalNote: "Diabetic with chronic ear pain + discharge — malignant OE risk even without facial nerve",
      tags: ["diabetic_ear", "skull_base_risk"],
    },
    {
      caseId: "p5-d4", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "sore_throat", age: 20, sex: "female", difficulty: "moderate",
      features: { exudate: true, tender_nodes: true, splenomegaly: true, fever: true, fatigue: true },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "infectious_mononucleosis",
      goldFlags: ["splenomegaly", "mono_triad"], clinicalNote: "Mono with splenomegaly → contact sports restriction is urgent clinical guidance", tags: ["mono_spleen", "activity_restriction"],
    },
    {
      caseId: "p5-d5", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "breathlessness", age: 42, sex: "female", difficulty: "hard",
      features: { sle: true, pleuriticPain: true, sob: true, saturation: 94, rash: false, fever: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "pulmonary_embolism",
      goldFlags: ["sle_hypercoagulable", "pleuritic_pain"], clinicalNote: "SLE patient with pleuritic SOB — high VTE risk from lupus anticoagulant", tags: ["hypercoagulable", "lupus_pe"],
    },
    {
      caseId: "p5-d6", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "headache", age: 65, sex: "male", difficulty: "hard",
      features: { temporal: true, jaw_claudication: true, unilateral_vision_loss: true, age: 68, esr_elevated: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "giant_cell_arteritis",
      goldFlags: ["vision_loss", "jaw_claudication", "elderly"], clinicalNote: "GCA — vision loss is irreversible without immediate steroids. ER + IV steroids today",
      tags: ["gca_temporal_arteritis", "vision_emergency"],
    },
    {
      caseId: "p5-d7", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "chest_pain", age: 35, sex: "male", difficulty: "hard",
      features: { tall: true, marfanoid: true, tearing: false, sob: true, pleuritic: true, unilateral: true },
      expectedDisposition: "er_now", expectedTopDiagnosis: "spontaneous_pneumothorax",
      goldFlags: ["tall_thin", "pleuritic_pain", "marfanoid"], clinicalNote: "Tall thin male with pleuritic chest pain — primary spontaneous pneumothorax pattern",
      tags: ["pneumothorax", "marfan_risk"],
    },
    {
      caseId: "p5-d8", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "dizziness", age: 55, sex: "female", difficulty: "hard",
      features: { newMedication: true, diuretic: true, orthostatic: true, syncope: false, durationDays: 2 },
      expectedDisposition: "urgent_care", expectedTopDiagnosis: "medication_induced_orthostatic_hypotension",
      goldFlags: ["new_medication", "orthostatic"], clinicalNote: "Orthostatic dizziness with new diuretic — fall risk assessment and medication review urgent",
      tags: ["orthostatic", "medication_induced"],
    },
    {
      caseId: "p5-d9", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "fever", age: 30, sex: "male", difficulty: "hard",
      features: { ivdu: true, temperature: 39.2, chills: true, murmur: true, emboli: false },
      expectedDisposition: "er_now", expectedTopDiagnosis: "endocarditis",
      goldFlags: ["ivdu", "fever_murmur"], clinicalNote: "IVDU + fever + murmur = endocarditis until blood cultures negative", tags: ["endocarditis", "ivdu_fever"],
    },
    {
      caseId: "p5-d10", pack: "disposition_edge", packLabel: "Disposition Edge",
      complaint: "cough", age: 52, sex: "male", difficulty: "hard",
      features: { ace_inhibitor: true, dry: true, non_productive: true, durationDays: 21, fever: false },
      expectedDisposition: "self_care", expectedTopDiagnosis: "ace_inhibitor_cough",
      goldFlags: [], clinicalNote: "ACE inhibitor cough — must review medication list before escalating. Safe to self-manage with medication change",
      tags: ["drug_cough", "ace_inhibitor"],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
export const PACKS: Record<Top50Pack, { label: string; description: string; cases: () => Top50Case[] }> = {
  misleading: {
    label: "Misleading Presentations",
    description: "Classic emergencies that look benign on the surface — atypical MI, masked SAH, PE as anxiety",
    cases: misleadingPack,
  },
  missing_data: {
    label: "Missing / Incomplete Data",
    description: "Cases with sparse or absent clinical information — tests default behavior and safe escalation",
    cases: missingDataPack,
  },
  conflicting: {
    label: "Conflicting Signals",
    description: "Symptoms pointing in opposite directions — history of migraine + thunderclap, anxiety vs hypoxia",
    cases: conflictingPack,
  },
  modifier_heavy: {
    label: "Modifier-Heavy Cases",
    description: "Age extremes, comorbidities, and medications that change risk stratification entirely",
    cases: modifierHeavyPack,
  },
  disposition_edge: {
    label: "Disposition Edge Cases",
    description: "Cases at the exact ER/urgent-care boundary — a single feature tips the outcome",
    cases: dispositionEdgePack,
  },
};

export function top50Cases(): Top50Case[] {
  return Object.values(PACKS).flatMap(p => p.cases());
}

export function packCases(packId: Top50Pack): Top50Case[] {
  return PACKS[packId]?.cases() ?? [];
}

export function packList() {
  return Object.entries(PACKS).map(([id, p]) => ({
    id,
    label: p.label,
    description: p.description,
    count: p.cases().length,
  }));
}
