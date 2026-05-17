/**
 * AURALYN — Remaining Complaint Packs
 * MSK · Dermatology · Psychiatric · Pediatric Fever
 *
 * These packs follow the same ComplaintPack interface as the existing 5 packs.
 * Each wraps clinical logic into a computeTriage() that returns a TriageResult.
 *
 * File: server/kb/complaintPacks/remaining-packs.ts
 */

import type { ComplaintPack, ExtractedClinicalState, TriageResult } from "./types";
import { buildStateFromInput, type ValidationInput } from "./validationHelpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function s(state: ExtractedClinicalState) { return state.symptoms ?? {}; }
function h(state: ExtractedClinicalState) { return { ...state.comorbidities.reduce((a: any, c) => ({ ...a, [c]: true }), {}), ageYears: state.ageYears, sex: state.sex }; }

// ════════════════════════════════════════════════════════════════════════════
// PACK 1: MUSCULOSKELETAL (MSK / Back Pain)
// Anatomy rarely changes management. Red flags drive disposition.
// ════════════════════════════════════════════════════════════════════════════

function assessMSKState(state: ExtractedClinicalState): TriageResult {
  const sym = s(state);

  const redFlags: string[] = [];
  if (sym.bony_tenderness && (state.comorbidities.includes("osteoporosis"))) redFlags.push("Bony point tenderness in osteoporotic patient — fracture risk");
  if (sym.joint_swelling && sym.fever) redFlags.push("Hot swollen joint with fever — septic arthritis until proven otherwise");
  if ((sym.saddle || sym.saddle_anesthesia) && sym.leg_weakness) redFlags.push("Saddle anesthesia + leg weakness — cauda equina, neurosurgery NOW");
  if (sym.bowel_bladder_dysfunction) redFlags.push("Bowel/bladder dysfunction with back pain — cauda equina emergency");
  if (sym.bony_tenderness && state.comorbidities.includes("cancer")) redFlags.push("Bony tenderness with cancer history — metastatic disease");
  if (sym.neurovascular_compromise) redFlags.push("Neurovascular compromise — compartment syndrome or vascular injury");
  if (sym.joint_swelling && sym.warmth && state.comorbidities.includes("gout")) redFlags.push("Acute gout flare");

  const isCaudaEquina = redFlags.some(r => r.includes("cauda equina") || r.includes("compartment") || r.includes("vascular"));
  const isSeptic      = redFlags.some(r => r.includes("septic") || r.includes("fracture") || r.includes("metastatic"));
  const needsImaging  = sym.inability_to_bear_weight && state.comorbidities.includes("prior_hernia_repair");

  const disposition =
    isCaudaEquina   ? "AMBULANCE_NOW" :
    isSeptic        ? "ER_NOW" :
    needsImaging    ? "URGENT_CARE_TODAY" :
    redFlags.length ? "URGENT_CARE_TODAY" :
    "HOME_CARE";

  const treatmentPlan = [
    "Relative rest — avoid activity that worsens pain, but do not fully immobilize",
    sym.acute_onset ? "Ice 20 min on / 20 min off for first 48 hours" : "Heat or ice — whichever feels better",
    "Ibuprofen 400–600 mg every 6 hours with food, OR naproxen 500 mg twice daily",
    "Acetaminophen 1000 mg every 6 hours alternating with ibuprofen for better control",
    ...(sym.muscle_spasm || sym.back_pain || sym.neck_pain
      ? ["Cyclobenzaprine 5–10 mg at bedtime (sedating — do not drive)"]
      : []),
    "Diclofenac gel (Voltaren) for localized pain — minimal systemic effect",
    needsImaging ? "X-ray to rule out fracture" : "No imaging indicated — anatomy rarely changes management",
    "Physical therapy if not improving in 2–3 weeks",
    "Return to ER if bowel/bladder problems develop with back pain (emergency)",
  ];

  return {
    disposition: disposition as any,
    dispositionColor: isCaudaEquina ? "critical" : isSeptic ? "urgent" : "routine",
    confidence: redFlags.length === 0 ? 0.85 : 0.75,
    topDifferentials: [
      { name: "Musculoskeletal strain",   probability: redFlags.length === 0 ? 0.75 : 0.3 },
      { name: "Lumbar disc herniation",   probability: 0.2 },
      { name: "Osteoarthritis",           probability: 0.15 },
    ],
    criticalGaps: redFlags,
    recommendedWorkup: needsImaging ? ["X-ray of affected area"] : ["No imaging indicated"],
    treatmentPlan,
    keyMessage: "MSK injuries and back pain almost always get better without imaging or surgery. Staying gently active heals faster than rest.",
  };
}

export const MSKBackPainPack: ComplaintPack = {
  complaintId: "msk_back_pain",
  displayName:  "Musculoskeletal / Back Pain",
  questionSets: [
    {
      phase: "hpi",
      questions: [
        { id: "msk_pain_location", text: "Where exactly is the pain?",                                                       extractKey: "painLocation" },
        { id: "msk_onset",         text: "Did the pain start suddenly after an injury, or come on gradually?",               extractKey: "onsetType" },
        { id: "msk_severity",      text: "On a scale of 0–10, how would you rate the pain right now?",                       extractKey: "painScore" },
        { id: "msk_bowel_bladder", text: "Have you noticed any changes in your bowel or bladder control since the pain started?", extractKey: "bowelBladderDysfunction" },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "msk_numbness",  text: "Do you have numbness or tingling in your arms or legs?", extractKey: "numbness" },
        { id: "msk_weakness",  text: "Do you feel any weakness in your legs?",                 extractKey: "leg_weakness" },
        { id: "msk_swelling",  text: "Is there any swelling, redness, or warmth?",             extractKey: "joint_swelling" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "msk_cancer",       text: "Have you ever had cancer?",                              extractKey: "cancerHistory" },
        { id: "msk_osteoporosis", text: "Have you been told you have osteoporosis or weak bones?", extractKey: "osteoporosis" },
        { id: "msk_trauma",       text: "Was there any recent fall, accident, or direct injury?",  extractKey: "recentTrauma" },
      ],
    },
  ],
  redFlags: [
    { id: "msk_cauda_equina", label: "Cauda equina syndrome", severity: "critical", match: st => !!(s(st).bowel_bladder_dysfunction) },
    { id: "msk_saddle",       label: "Saddle anesthesia",     severity: "critical", match: st => !!(s(st).saddle && s(st).leg_weakness) },
    { id: "msk_septic_joint", label: "Septic joint",          severity: "critical", match: st => !!(s(st).joint_swelling && s(st).fever) },
  ],
  computeTriage: assessMSKState,
};

export function assessMSK(input: ValidationInput): TriageResult {
  return MSKBackPainPack.computeTriage(buildStateFromInput(input, "msk_back_pain", "musculoskeletal pain"));
}

// ════════════════════════════════════════════════════════════════════════════
// PACK 2: DERMATOLOGY
// Framework: distribution + morphology + systemic symptoms.
// ════════════════════════════════════════════════════════════════════════════

function classifyMorphology(sym: Record<string, any>): string {
  if (sym.vesicles || sym.bullae)          return "vesicular";
  if (sym.pustules)                        return "pustular";
  if (sym.urticaria || sym.hives)          return "urticarial";
  if (sym.scaly || sym.silvery_scale)      return "papulosquamous";
  if (sym.macules)                         return "macular";
  if (sym.papules)                         return "papular";
  if (sym.purpura || sym.petechiae)        return "purpuric";
  return "unclassified";
}

function assessDermatologyState(state: ExtractedClinicalState): TriageResult {
  const sym = s(state);
  const morphology = classifyMorphology(sym);

  const redFlags: string[] = [];
  if (sym.rash_with_fever && sym.petechiae)            redFlags.push("Petechial rash with fever — meningococcemia, ER now");
  if (sym.rapidly_spreading && sym.fever && sym.skin_necrosis) redFlags.push("Necrotizing fasciitis — surgical emergency, ambulance");
  if (sym.hives_facial && sym.dyspnea)                 redFlags.push("Urticaria + dyspnea — anaphylaxis, epinephrine now");
  if (sym.mucosal_involvement && sym.rash)             redFlags.push("Mucosal involvement — Stevens-Johnson syndrome concern, ER");
  if (sym.bullae && sym.widespread)                    redFlags.push("Widespread bullae — pemphigus or TEN, ER");
  if (sym.painful_rash && sym.dermatomal)              redFlags.push("Dermatomal painful rash — Herpes Zoster, treat within 72h");
  if (state.comorbidities.includes("diabetes") && sym.cellulitis && sym.fever) redFlags.push("Cellulitis in diabetic with fever — IV antibiotics likely needed");

  const isAmbulance = redFlags.some(r => r.includes("ambulance") || r.includes("anaphylaxis") || r.includes("necrotizing"));
  const isER        = redFlags.some(r => r.includes("ER") || r.includes("Stevens-Johnson") || r.includes("TEN"));
  const isERToday   = redFlags.some(r => r.includes("IV antibiotics"));

  const disposition =
    isAmbulance   ? "AMBULANCE_NOW" :
    isER          ? "ER_NOW" :
    isERToday     ? "ER_URGENT" :
    redFlags.length > 0 ? "URGENT_CARE_TODAY" :
    "HOME_CARE";

  const differentials = [];
  if (sym.dermatomal && sym.painful_rash) differentials.push({ name: "Herpes Zoster (shingles)", probability: 0.85, icd10: "B02.9" });
  if (sym.urticaria || sym.hives)         differentials.push({ name: "Urticaria (hives)",         probability: 0.80, icd10: "L50.9" });
  if (sym.well_demarcated_red && sym.warm) differentials.push({ name: "Cellulitis",                probability: 0.75, icd10: "L03.90" });
  if (sym.ring_like && sym.central_clearing) differentials.push({ name: "Tinea (ringworm)",        probability: 0.75, icd10: "B35.4" });
  if (sym.vesicles && !sym.dermatomal)    differentials.push({ name: "Contact dermatitis",          probability: 0.6,  icd10: "L23.9" });
  if (sym.scaly && sym.silvery_scale)     differentials.push({ name: "Psoriasis",                   probability: 0.5,  icd10: "L40.0" });
  if (differentials.length === 0)         differentials.push({ name: "Undifferentiated rash",       probability: 0.3,  icd10: "R21" });

  const topDx = differentials[0]?.name ?? "";
  const treatmentPlan: string[] = [];
  if (topDx.includes("Zoster"))     treatmentPlan.push("Valacyclovir 1g three times daily x 7 days — start within 72h of onset", "Acetaminophen + ibuprofen alternating for pain");
  else if (topDx.includes("Cellulitis")) treatmentPlan.push("Cephalexin 500mg four times daily x 5–7 days", "Mark border with pen to monitor spread", "Elevate affected area");
  else if (topDx.includes("Urticaria"))  treatmentPlan.push("Cetirizine 10mg daily or loratadine 10mg daily", "Prednisone 40mg x 5 days if widespread");
  else if (topDx.includes("Tinea"))      treatmentPlan.push("Clotrimazole or terbinafine topical twice daily x 2–4 weeks");
  else if (topDx.includes("Contact"))    treatmentPlan.push("Topical hydrocortisone 1% twice daily", "Identify and remove the trigger");
  else treatmentPlan.push("Dermatology referral recommended");

  return {
    disposition: disposition as any,
    dispositionColor: isAmbulance ? "critical" : isER ? "urgent" : "routine",
    confidence: differentials[0]?.probability ?? 0.5,
    topDifferentials: differentials.slice(0, 3),
    criticalGaps: redFlags,
    recommendedWorkup: ["Clinical examination required for accurate morphology classification"],
    treatmentPlan,
    keyMessage: redFlags.length === 0
      ? "Most rashes and skin conditions are not dangerous and respond well to treatment."
      : `Red flag identified: ${redFlags[0]}`,
  };
}

export const DermatologyPack: ComplaintPack = {
  complaintId: "derm_rash",
  displayName:  "Dermatology / Rash",
  questionSets: [
    {
      phase: "hpi",
      questions: [
        { id: "derm_where",      text: "Where on your body is the rash — is it in one area or spreading?",         extractKey: "rashLocation" },
        { id: "derm_onset",      text: "When did the rash start and how quickly has it spread?",                   extractKey: "symptomDuration" },
        { id: "derm_quality",    text: "Does it look like blisters, flat spots, raised bumps, or hives?",          extractKey: "rashMorphology" },
        { id: "derm_painful",    text: "Is the rash painful, burning, or itchy?",                                  extractKey: "painful_rash" },
        { id: "derm_fever",      text: "Do you have a fever or feel flu-like along with the rash?",                extractKey: "rash_with_fever" },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "derm_breathing",  text: "Do you have difficulty breathing, throat tightening, or facial swelling?", extractKey: "dyspnea" },
        { id: "derm_mucosal",    text: "Is the rash affecting your eyes, mouth, or genitals?",                     extractKey: "mucosal_involvement" },
        { id: "derm_dermatomal", text: "Does the rash follow a band or stripe on one side of your body?",          extractKey: "dermatomal" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "derm_allergies",  text: "Have you started any new medications, foods, or products recently?", extractKey: "newExposure" },
        { id: "derm_diabetes",   text: "Do you have diabetes or a weakened immune system?",                  extractKey: "diabetes" },
      ],
    },
  ],
  redFlags: [
    { id: "derm_anaphylaxis", label: "Anaphylaxis risk",        severity: "critical", match: st => !!(s(st).hives_facial && s(st).dyspnea) },
    { id: "derm_necrotizing", label: "Necrotizing fasciitis",   severity: "critical", match: st => !!(s(st).rapidly_spreading && s(st).fever && s(st).skin_necrosis) },
    { id: "derm_petechiae",   label: "Petechial rash + fever",  severity: "critical", match: st => !!(s(st).rash_with_fever && s(st).petechiae) },
    { id: "derm_sjs",         label: "Stevens-Johnson concern", severity: "critical", match: st => !!(s(st).mucosal_involvement && s(st).rash) },
  ],
  computeTriage: assessDermatologyState,
};

export function assessDermatology(input: ValidationInput): TriageResult {
  return DermatologyPack.computeTriage(buildStateFromInput(input, "derm_rash", "rash"));
}

// ════════════════════════════════════════════════════════════════════════════
// PACK 3: PSYCHIATRIC / BEHAVIORAL HEALTH
// Safety first. C-SSRS lite. Suicidality screens immediately.
// ════════════════════════════════════════════════════════════════════════════

function buildSafetyPlan(state: ExtractedClinicalState): string[] {
  const sym = s(state);
  const plan: string[] = [
    "1. Warning signs — what triggers crisis thoughts?",
    "2. Internal coping strategies — what can you do alone to feel better?",
    "3. Social contacts — who helps distract you?",
    "4. People and agencies to contact in crisis — 988 Lifeline, Crisis Text Line",
    "5. Make the environment safer — remove or secure lethal means",
    "6. Reasons for living — what's important to you?",
  ];
  return plan;
}

function assessSuicidality(sym: Record<string, any>, comorbidities: string[]): "none" | "low" | "moderate" | "high" {
  if (sym.active_plan && sym.intent) return "high";
  if (sym.active_ideation && sym.active_plan) return "high";
  if (sym.active_ideation && comorbidities.includes("prior_attempt")) return "high";
  if (sym.active_ideation) return "moderate";
  if (sym.passive_ideation) return "low";
  return "none";
}

function assessPsychiatricState(state: ExtractedClinicalState): TriageResult {
  const sym = s(state);
  const suicidalRisk   = assessSuicidality(sym, state.comorbidities);
  const homicidalRisk  = !!(sym.homicidal_ideation || sym.specific_threat);
  const psychosisPresent = !!(sym.hallucinations || sym.delusions || sym.disorganized_speech);
  const maniaSigns       = !!(sym.grandiosity && sym.decreased_sleep_need && sym.racing_thoughts);

  const redFlags: string[] = [];
  if (suicidalRisk === "high")    redFlags.push("Active suicidal ideation with plan or intent — 1:1 monitoring, ER");
  if (homicidalRisk)              redFlags.push("Homicidal ideation — safety assessment, ER, duty to warn");
  if (psychosisPresent)           redFlags.push("Active psychosis — antipsychotic evaluation needed");
  if (maniaSigns)                 redFlags.push("Manic episode signs — mood stabilizer assessment");
  if (sym.altered_mental_status && !sym.known_psych_dx) redFlags.push("AMS without psych history — rule out organic cause first");

  const disposition =
    suicidalRisk === "high" || homicidalRisk  ? "ER_NOW" :
    psychosisPresent || maniaSigns            ? "ER_URGENT" :
    suicidalRisk === "moderate"               ? "URGENT_CARE_TODAY" :
    "PRIMARY_CARE_48H";

  return {
    disposition: disposition as any,
    dispositionColor: suicidalRisk === "high" || homicidalRisk ? "critical" : psychosisPresent ? "urgent" : "routine",
    confidence: 0.8,
    topDifferentials: [
      { name: "Anxiety/Panic disorder",   probability: 0.4 },
      { name: "Major depressive episode", probability: 0.3 },
      { name: "Acute psychotic episode",  probability: psychosisPresent ? 0.6 : 0.1 },
    ],
    criticalGaps: redFlags,
    recommendedWorkup: ["Safety assessment required", "Vital signs and metabolic panel if AMS"],
    treatmentPlan: [
      "988 Suicide and Crisis Lifeline — call or text 988",
      "Crisis Text Line — text HOME to 741741",
      suicidalRisk !== "none" ? "Remove access to lethal means (firearms, medications)" : "",
      "Outpatient mental health referral if stable",
      ...(suicidalRisk !== "none" ? buildSafetyPlan(state) : []),
    ].filter(Boolean),
    keyMessage: suicidalRisk !== "none"
      ? "Your safety is the most important thing right now. We are here to help."
      : "Mental health is health. Let's get you connected to the right support.",
  };
}

export const PsychiatricPack: ComplaintPack = {
  complaintId: "psychiatric",
  displayName:  "Psychiatric / Behavioral Health",
  questionSets: [
    {
      phase: "hpi",
      questions: [
        { id: "psych_chief",      text: "What brings you in today emotionally or mentally?",                       extractKey: "chiefConcern" },
        { id: "psych_si_passive", text: "Have you had thoughts of hurting yourself or not wanting to be alive?",  extractKey: "passive_ideation" },
        { id: "psych_si_active",  text: "Have you thought about a specific plan to hurt yourself?",               extractKey: "active_plan",
          condition: st => !!(s(st).passive_ideation || s(st).active_ideation) },
        { id: "psych_intent",     text: "Do you have any intention of acting on those thoughts?",                 extractKey: "intent",
          condition: st => !!(s(st).active_plan) },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "psych_psychosis",  text: "Have you been hearing or seeing things others don't?",                   extractKey: "hallucinations" },
        { id: "psych_mania",      text: "Have you had periods of feeling unusually energetic, needing very little sleep?", extractKey: "decreased_sleep_need" },
        { id: "psych_homicidal",  text: "Have you had thoughts of hurting someone else?",                         extractKey: "homicidal_ideation" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "psych_prior_attempt", text: "Have you ever attempted to hurt yourself in the past?",              extractKey: "priorAttempt" },
        { id: "psych_dx",            text: "Have you been diagnosed with any mental health conditions?",         extractKey: "known_psych_dx" },
        { id: "psych_meds",          text: "Are you currently taking any medications?",                          extractKey: "currentMedications" },
      ],
    },
  ],
  redFlags: [
    { id: "psych_si_high",   label: "Active suicidal ideation with plan", severity: "critical", match: st => !!(s(st).active_plan && s(st).intent) },
    { id: "psych_homicidal", label: "Homicidal ideation",                 severity: "critical", match: st => !!(s(st).homicidal_ideation) },
    { id: "psych_psychosis", label: "Active psychosis",                   severity: "high",     match: st => !!(s(st).hallucinations || s(st).delusions) },
  ],
  computeTriage: assessPsychiatricState,
};

export function assessPsychiatric(input: ValidationInput): TriageResult {
  return PsychiatricPack.computeTriage(buildStateFromInput(input, "psychiatric", "psychiatric chief complaint"));
}

// ════════════════════════════════════════════════════════════════════════════
// PACK 4: PEDIATRIC FEVER
// Age-stratified risk. Febrile infants < 90 days are HIGH-RISK by default.
// Older children: source-driven. Red flags: ill appearance, purpura.
// ════════════════════════════════════════════════════════════════════════════

function assessPediatricFeverState(state: ExtractedClinicalState): TriageResult {
  const sym  = s(state);
  const age  = state.ageYears ?? 10;
  const ageD = (sym.age_days as number) ?? Math.round(age * 365);
  const tempF = state.tempF ?? (sym.fever ? 101.0 : 98.6);

  const redFlags: string[] = [];

  // Neonatal / infant fever — highest risk by age alone
  if (ageD <= 60  && tempF >= 100.4) redFlags.push("Febrile infant ≤60 days — full sepsis workup mandatory (ER now)");
  if (ageD > 60 && ageD <= 90 && tempF >= 100.4) redFlags.push("Febrile infant 61–90 days — apply Rochester criteria (ER now)");

  // Red flag symptoms independent of age
  if (sym.petechiae || sym.purpura) redFlags.push("Petechiae/purpura with fever — meningococcemia, ambulance NOW");
  if (sym.neck_stiffness && sym.fever) redFlags.push("Fever + neck stiffness — bacterial meningitis until proven otherwise");
  if (sym.febrile_seizure) redFlags.push("Febrile seizure — ER today for evaluation");
  if (sym.ill_appearing || sym.toxic_appearing) redFlags.push("Ill-appearing/toxic child — ER now regardless of temp");
  if (sym.severe_dehydration || sym.unable_to_drink) redFlags.push("Unable to take fluids — dehydration risk, ER today");
  if (sym.rash && sym.fever && sym.neck_stiffness) redFlags.push("Meningitis triad — ambulance now");
  if (tempF >= 104.0 && ageD > 90) redFlags.push("High fever ≥104°F — source evaluation needed");

  const isAmbulance  = redFlags.some(r => r.includes("ambulance"));
  const isERNow      = redFlags.some(r => r.includes("ER now") || r.includes("ER now)") || (ageD <= 90 && tempF >= 100.4));
  const isERToday    = redFlags.some(r => r.includes("ER today"));
  const isUrgentCare = redFlags.some(r => r.includes("≥104°F"));

  const disposition =
    isAmbulance   ? "AMBULANCE_NOW" :
    isERNow       ? "ER_NOW" :
    isERToday     ? "ER_URGENT" :
    isUrgentCare  ? "URGENT_CARE_TODAY" :
    "HOME_CARE";

  const treatmentPlan = [];
  if (isAmbulance || isERNow) {
    treatmentPlan.push("Go to ER immediately", "Do not give fever-reducing medications — may mask severity", "Bring immunization records");
  } else {
    treatmentPlan.push(
      "Acetaminophen (Tylenol) 10–15 mg/kg every 4–6 hours as needed",
      "Ibuprofen (Advil/Motrin) 10 mg/kg every 6–8 hours (only if ≥6 months old)",
      "Push fluids — water, Pedialyte, breastmilk/formula",
      "Monitor for rash, stiff neck, difficulty breathing, or looking very sick",
      "Return immediately if: rash appears, inconsolable crying, difficulty breathing, won't drink fluids"
    );
  }

  return {
    disposition: disposition as any,
    dispositionColor: isAmbulance ? "critical" : isERNow ? "urgent" : "routine",
    confidence: ageD <= 90 ? 0.95 : 0.75,
    topDifferentials: [
      { name: "Viral URI / febrile illness",    probability: ageD > 90 ? 0.65 : 0.3 },
      { name: "Occult bacteremia",              probability: ageD <= 90 ? 0.35 : 0.05 },
      { name: "Urinary tract infection",        probability: 0.15 },
    ],
    criticalGaps: redFlags,
    recommendedWorkup: ageD <= 90
      ? ["Full sepsis workup (CBC, blood culture, UA/UC, LP)", "CRP/procalcitonin", "Chest X-ray if respiratory symptoms"]
      : ["Temperature, O2 sat, HR", "UA if ≥6 months", "Strep test if sore throat", "CXR if respiratory symptoms"],
    treatmentPlan,
    keyMessage: ageD <= 90
      ? "Fever in an infant under 3 months is always an emergency. Go to the ER now."
      : "Most fevers in children over 3 months are from viruses and get better with time and fluids.",
  };
}

export const PediatricFeverPack: ComplaintPack = {
  complaintId: "pediatric_fever",
  displayName:  "Pediatric Fever",
  questionSets: [
    {
      phase: "hpi",
      questions: [
        { id: "peds_age",          text: "How old is the child?",                                                   extractKey: "age" },
        { id: "peds_temp",         text: "What is the temperature and how was it measured?",                         extractKey: "tempF" },
        { id: "peds_duration",     text: "How long has the fever been present?",                                     extractKey: "symptomDuration" },
        { id: "peds_ill_appear",   text: "Does the child look very sick, pale, or unusually difficult to wake up?",  extractKey: "ill_appearing" },
        { id: "peds_drink",        text: "Is the child drinking fluids normally?",                                   extractKey: "able_to_drink" },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "peds_rash",         text: "Do you see any rash, spots, or purple marks on the skin?",  extractKey: "petechiae" },
        { id: "peds_neck",         text: "Does the child's neck feel stiff or hard to move?",          extractKey: "neck_stiffness" },
        { id: "peds_seizure",      text: "Has the child had any shaking or seizure activity?",          extractKey: "febrile_seizure" },
        { id: "peds_breathing",    text: "Is the child breathing fast or working hard to breathe?",    extractKey: "dyspnea" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "peds_immunized",    text: "Is the child up to date on vaccines?",                       extractKey: "immunized" },
        { id: "peds_prematurity",  text: "Was the child born premature (before 37 weeks)?",             extractKey: "premature" },
        { id: "peds_chronic_dx",   text: "Does the child have any chronic medical conditions?",         extractKey: "chronicConditions" },
      ],
    },
  ],
  redFlags: [
    { id: "peds_neonate",    label: "Febrile neonate ≤60 days",      severity: "critical", match: st => !!(((st.symptoms["age_days"] ?? 999) <= 60) && (st.tempF ?? 0) >= 100.4) },
    { id: "peds_petechiae",  label: "Petechiae/purpura with fever",  severity: "critical", match: st => !!(s(st).petechiae || s(st).purpura) },
    { id: "peds_meningitis", label: "Meningitis signs",              severity: "critical", match: st => !!(s(st).neck_stiffness && s(st).fever) },
    { id: "peds_ill",        label: "Ill-appearing child",           severity: "critical", match: st => !!(s(st).ill_appearing || s(st).toxic_appearing) },
  ],
  computeTriage: assessPediatricFeverState,
};

export function assessPediatricFever(input: ValidationInput): TriageResult {
  return PediatricFeverPack.computeTriage(buildStateFromInput(input, "pediatric_fever", "pediatric fever"));
}
