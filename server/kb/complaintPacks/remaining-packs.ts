/**
 * AURALYN — Remaining Complaint Packs
 * MSK · Dermatology · Psychiatric / Behavioral Health
 *
 * These packs follow the same ComplaintPack interface as the existing 5 packs.
 * Each wraps clinical logic into a computeTriage() that returns a TriageResult.
 *
 * File: server/kb/complaintPacks/remaining-packs.ts
 */

import type { ComplaintPack, ExtractedClinicalState, TriageResult, AnswerEntry } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function s(state: ExtractedClinicalState) { return state.symptoms ?? {}; }
function h(state: ExtractedClinicalState) { return state.history ?? {}; }
function v(state: ExtractedClinicalState) { return state.vitals ?? {}; }
function e(state: ExtractedClinicalState) { return state.examFindings ?? {}; }

// ════════════════════════════════════════════════════════════════════════════
// PACK 1: MUSCULOSKELETAL (MSK / Back Pain)
// Anatomy rarely changes management. Red flags drive disposition.
// Most MSK is self-limiting.
// ════════════════════════════════════════════════════════════════════════════

function assessMSK(state: ExtractedClinicalState): TriageResult {
  const sym  = s(state);
  const hist = h(state);
  const exam = e(state);

  const redFlags: string[] = [];
  if (sym.bonyTenderness && hist.osteoporosis)       redFlags.push("Bony point tenderness in osteoporotic patient — fracture risk");
  if (sym.jointSwelling  && sym.fever)               redFlags.push("Hot swollen joint with fever — septic arthritis until proven otherwise");
  if (sym.saddleAnesthesia && sym.legWeakness)        redFlags.push("Saddle anesthesia + leg weakness — cauda equina, neurosurgery NOW");
  if (sym.bowelBladderDysfunction)                    redFlags.push("Bowel/bladder dysfunction with back pain — cauda equina emergency");
  if (sym.bonyTenderness && hist.cancerHistory)       redFlags.push("Bony tenderness with cancer history — metastatic disease");
  if (exam.neurovascularCompromise)                   redFlags.push("Neurovascular compromise — compartment syndrome or vascular injury");
  if (sym.jointSwelling && sym.warmth && hist.goutHistory) redFlags.push("Acute gout flare");

  const isCaudaEquina = redFlags.some(r => r.includes("cauda equina") || r.includes("compartment") || r.includes("vascular"));
  const isSeptic      = redFlags.some(r => r.includes("septic") || r.includes("fracture") || r.includes("metastatic"));
  const needsImaging  = sym.inabilityToBearWeight && hist.recentTrauma;

  const disposition =
    isCaudaEquina   ? "ambulance_now" :
    isSeptic        ? "er_now" :
    needsImaging    ? "urgent_care_today" :
    redFlags.length ? "urgent_care_followup" :
    "treat_and_watch";

  const treatmentPlan = [
    "Relative rest — avoid activity that worsens pain, but do not fully immobilize",
    sym.acuteOnset ? "Ice 20 min on / 20 min off for first 48 hours" : "Heat or ice — whichever feels better",
    "Ibuprofen 400–600 mg every 6 hours with food, OR naproxen 500 mg twice daily",
    "Acetaminophen 1000 mg every 6 hours alternating with ibuprofen for better control",
    ...(sym.muscleSpasm || sym.backPain || sym.neckPain
      ? ["Cyclobenzaprine 5–10 mg at bedtime (sedating — do not drive)"]
      : []),
    "Diclofenac gel (Voltaren) for localized pain — minimal systemic effect",
    needsImaging ? "X-ray to rule out fracture" : "No imaging indicated — anatomy rarely changes management",
    "Physical therapy if not improving in 2–3 weeks",
    "Return to ER if: bowel/bladder problems develop with back pain (emergency)",
  ];

  return {
    disposition: disposition.toUpperCase() as any,
    dispositionColor: isCaudaEquina ? "critical" : isSeptic ? "urgent" : "routine",
    confidence: redFlags.length === 0 ? 0.85 : 0.75,
    topDifferentials: [
      { name: "Musculoskeletal strain", probability: redFlags.length === 0 ? 0.75 : 0.3 },
      { name: "Lumbar disc herniation", probability: 0.2 },
      { name: "Osteoarthritis",         probability: 0.15 },
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
        { id: "msk_pain_location", text: "Where exactly is the pain — neck, upper back, lower back, or a joint like a knee or hip?", extractKey: "painLocation" },
        { id: "msk_onset",         text: "Did the pain start suddenly after an injury or activity, or come on gradually?",           extractKey: "onsetType" },
        { id: "msk_severity",      text: "On a scale of 0–10, how would you rate the pain right now?",                             extractKey: "painScore" },
        { id: "msk_radiation",     text: "Does the pain shoot down your arm or leg?",                                              extractKey: "radiation" },
        { id: "msk_bowel_bladder", text: "Have you noticed any changes in your bowel or bladder control since the pain started?",  extractKey: "bowelBladderDysfunction" },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "msk_numbness",    text: "Do you have numbness or tingling in your arms or legs?", extractKey: "numbness" },
        { id: "msk_weakness",    text: "Do you feel any weakness in your legs?",                 extractKey: "legWeakness" },
        { id: "msk_swelling",    text: "Is there any swelling, redness, or warmth in the affected area?", extractKey: "jointSwelling" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "msk_cancer",       text: "Have you ever had cancer or been treated for cancer?",        extractKey: "cancerHistory" },
        { id: "msk_osteoporosis", text: "Have you been told you have osteoporosis or weak bones?",     extractKey: "osteoporosis" },
        { id: "msk_trauma",       text: "Was there any recent fall, accident, or direct injury?",      extractKey: "recentTrauma" },
      ],
    },
  ],
  redFlags: [
    { id: "msk_cauda_equina", label: "Cauda equina syndrome", severity: "critical", match: st => !!(s(st).bowelBladderDysfunction) },
    { id: "msk_saddle",       label: "Saddle anesthesia",     severity: "critical", match: st => !!(s(st).saddleAnesthesia && s(st).legWeakness) },
    { id: "msk_septic_joint", label: "Septic joint",          severity: "critical", match: st => !!(s(st).jointSwelling && s(st).fever) },
  ],
  computeTriage: assessMSK,
};

// ════════════════════════════════════════════════════════════════════════════
// PACK 2: DERMATOLOGY
// Framework: distribution + morphology + systemic symptoms.
// Most skin conditions are benign. Red flags are specific.
// ════════════════════════════════════════════════════════════════════════════

function assessDermatology(state: ExtractedClinicalState): TriageResult {
  const sym  = s(state);
  const hist = h(state);

  const redFlags: string[] = [];
  if (sym.rashWithFever && sym.petechiae)            redFlags.push("Petechial rash with fever — meningococcemia, ER now");
  if (sym.rapidlySpreading && sym.fever && sym.skinNecrosis) redFlags.push("Necrotizing fasciitis — surgical emergency, ambulance");
  if (sym.hivesFacial && sym.dyspnea)                redFlags.push("Urticaria + dyspnea — anaphylaxis, epinephrine now");
  if (sym.mucosalInvolvement && sym.rash)            redFlags.push("Mucosal involvement — Stevens-Johnson syndrome concern, ER");
  if (sym.bullae && sym.widespread)                  redFlags.push("Widespread bullae — pemphigus or TEN, ER");
  if (sym.painfulRash && sym.dermatomal)             redFlags.push("Dermatomal painful rash — Herpes Zoster, treat within 72h");
  if (hist.diabetes && sym.cellulitis && sym.fever)  redFlags.push("Cellulitis in diabetic with fever — IV antibiotics likely needed");

  const isAmbulance = redFlags.some(r => r.includes("ambulance") || r.includes("anaphylaxis") || r.includes("necrotizing"));
  const isER        = redFlags.some(r => r.includes("ER") || r.includes("Stevens-Johnson") || r.includes("TEN"));
  const isERToday   = redFlags.some(r => r.includes("IV antibiotics"));

  const disposition =
    isAmbulance ? "ambulance_now" :
    isER        ? "er_now" :
    isERToday   ? "er_today" :
    redFlags.length > 0 ? "urgent_care_today" :
    "treat_and_watch";

  // Build primary differential
  const differentials = [];
  if (sym.dermatomal && sym.painfulRash) differentials.push({ name: "Herpes Zoster (shingles)", probability: 0.85, icd10: "B02.9" });
  if (sym.urticaria || sym.hives)        differentials.push({ name: "Urticaria (hives)", probability: 0.80, icd10: "L50.9" });
  if (sym.wellDemarcatedRed && sym.warm) differentials.push({ name: "Cellulitis", probability: 0.75, icd10: "L03.90" });
  if (sym.ringLike && sym.centralClearing) differentials.push({ name: "Tinea (ringworm)", probability: 0.75, icd10: "B35.4" });
  if (sym.vesicles && !sym.dermatomal)   differentials.push({ name: "Contact dermatitis", probability: 0.6, icd10: "L23.9" });
  if (sym.scaly && sym.silveryScale)     differentials.push({ name: "Psoriasis", probability: 0.5, icd10: "L40.0" });
  if (differentials.length === 0)        differentials.push({ name: "Undifferentiated rash", probability: 0.3, icd10: "R21" });

  const treatmentPlan = [];
  const topDx = differentials[0]?.name ?? "";
  if (topDx.includes("Zoster"))      treatmentPlan.push("Valacyclovir 1g three times daily x 7 days — start within 72h of onset", "Acetaminophen + ibuprofen alternating for pain", "Avoid contact with immunocompromised individuals until lesions crust");
  else if (topDx.includes("Cellulitis")) treatmentPlan.push("Cephalexin 500mg four times daily x 5–7 days", "Mark the border with a pen to monitor spread", "Elevate the affected area");
  else if (topDx.includes("Urticaria"))  treatmentPlan.push("Cetirizine 10mg daily or loratadine 10mg daily", "Prednisone 40mg daily x 5 days if widespread");
  else if (topDx.includes("Tinea"))      treatmentPlan.push("Clotrimazole or terbinafine topical twice daily x 2–4 weeks");
  else if (topDx.includes("Contact"))    treatmentPlan.push("Topical hydrocortisone 1% twice daily", "Identify and remove the trigger");
  else treatmentPlan.push("Dermatology referral recommended");

  return {
    disposition: disposition.toUpperCase() as any,
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
        { id: "derm_where",     text: "Where on your body is the rash — is it in one area or spreading?",                  extractKey: "rashLocation" },
        { id: "derm_onset",     text: "When did the rash start and how quickly has it spread?",                            extractKey: "symptomDuration" },
        { id: "derm_quality",   text: "Does it look like blisters, flat spots, raised bumps, or hives?",                  extractKey: "rashMorphology" },
        { id: "derm_painful",   text: "Is the rash painful, burning, or itchy?",                                          extractKey: "painfulRash" },
        { id: "derm_fever",     text: "Do you have a fever or feel like you have the flu along with the rash?",           extractKey: "rashWithFever" },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "derm_breathing", text: "Do you have any difficulty breathing, throat tightening, or swelling of your lips or face?", extractKey: "dyspnea" },
        { id: "derm_mucosal",   text: "Is the rash affecting your eyes, mouth, or genitals?",                              extractKey: "mucosalInvolvement" },
        { id: "derm_dermatomal",text: "Does the rash follow a band or stripe on one side of your body?",                   extractKey: "dermatomal" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "derm_allergies", text: "Have you started any new medications, foods, or products recently?",    extractKey: "newExposure" },
        { id: "derm_diabetes",  text: "Do you have diabetes or a weakened immune system?",                     extractKey: "diabetes" },
      ],
    },
  ],
  redFlags: [
    { id: "derm_anaphylaxis", label: "Anaphylaxis risk",        severity: "critical", match: st => !!(s(st).hivesFacial && s(st).dyspnea) },
    { id: "derm_necrotizing", label: "Necrotizing fasciitis",   severity: "critical", match: st => !!(s(st).rapidlySpreading && s(st).fever && s(st).skinNecrosis) },
    { id: "derm_petechiae",   label: "Petechial rash + fever",  severity: "critical", match: st => !!(s(st).rashWithFever && s(st).petechiae) },
    { id: "derm_sjs",         label: "Stevens-Johnson concern", severity: "critical", match: st => !!(s(st).mucosalInvolvement && s(st).rash) },
  ],
  computeTriage: assessDermatology,
};

// ════════════════════════════════════════════════════════════════════════════
// PACK 3: PSYCHIATRIC / BEHAVIORAL HEALTH
// Safety first. Suicidality screens immediately.
// Columbia Suicide Severity Rating Scale (C-SSRS) lite.
// ════════════════════════════════════════════════════════════════════════════

function assessPsychiatric(state: ExtractedClinicalState): TriageResult {
  const sym  = s(state);
  const hist = h(state);

  // C-SSRS lite
  const suicidalRisk =
    (sym.activePlan && sym.intent)                  ? "high" :
    (sym.activeIdeation && sym.plan)                ? "high" :
    (sym.activeIdeation && hist.priorAttempt)       ? "high" :
    sym.activeIdeation                              ? "moderate" :
    sym.passiveIdeation                             ? "low" :
    "none";

  const homicidalRisk  = !!(sym.homicidalIdeation || sym.specificThreat);
  const psychosisPresent = !!(sym.hallucinations || sym.delusions || sym.disorganizedSpeech);
  const maniaSigns       = !!(sym.grandiosity && sym.decreasedSleepNeed && sym.racingThoughts);

  const redFlags: string[] = [];
  if (suicidalRisk === "high")    redFlags.push("Active suicidal ideation with plan or intent — 1:1 monitoring, ER");
  if (homicidalRisk)              redFlags.push("Homicidal ideation — safety assessment, ER, duty to warn");
  if (psychosisPresent)           redFlags.push("Active psychosis — antipsychotic evaluation needed");
  if (maniaSigns)                 redFlags.push("Manic episode signs — mood stabilizer assessment");
  if (sym.alteredMentalStatus && !hist.knownPsychDx) redFlags.push("AMS without psych history — rule out organic cause first");

  const disposition =
    suicidalRisk === "high" || homicidalRisk  ? "er_now" :
    psychosisPresent || maniaSigns            ? "er_today" :
    suicidalRisk === "moderate"               ? "urgent_care_today" :
    "primary_care_48h";

  return {
    disposition: disposition.toUpperCase() as any,
    dispositionColor: suicidalRisk === "high" || homicidalRisk ? "critical" : psychosisPresent ? "urgent" : "routine",
    confidence: 0.8,
    topDifferentials: [
      { name: "Anxiety/Panic disorder",    probability: 0.4 },
      { name: "Major depressive episode",  probability: 0.3 },
      { name: "Acute psychotic episode",   probability: psychosisPresent ? 0.6 : 0.1 },
    ],
    criticalGaps: redFlags,
    recommendedWorkup: ["Safety assessment required", "Vital signs and basic metabolic panel if AMS"],
    treatmentPlan: [
      "988 Suicide and Crisis Lifeline — call or text 988",
      "Crisis Text Line — text HOME to 741741",
      suicidalRisk !== "none" ? "Remove access to lethal means (firearms, medications)" : "",
      "Outpatient mental health referral if stable",
    ].filter(Boolean),
    keyMessage: suicidalRisk !== "none"
      ? "Your safety is the most important thing right now. We are here to help."
      : "Mental health is health. Let's get you connected to the right support.",
  };
}

export const PsychiatricPack: ComplaintPack = {
  complaintId: "id_fever",
  displayName:  "Psychiatric / Behavioral Health",
  questionSets: [
    {
      phase: "hpi",
      questions: [
        { id: "psych_chief",         text: "What brings you in today — what's been happening for you emotionally or mentally?", extractKey: "chiefConcern" },
        { id: "psych_si_passive",    text: "Have you been having any thoughts of hurting yourself or not wanting to be alive?",  extractKey: "passiveIdeation" },
        { id: "psych_si_active",
          text: "Have you thought about a specific plan to hurt yourself?",
          extractKey: "activePlan",
          condition: (st) => !!(s(st).passiveIdeation || s(st).activeIdeation),
        },
        { id: "psych_intent",
          text: "Do you have any intention of acting on these thoughts?",
          extractKey: "intent",
          condition: (st) => !!(s(st).activePlan),
        },
      ],
    },
    {
      phase: "ros",
      questions: [
        { id: "psych_psychosis",  text: "Have you been hearing or seeing things that others don't?",                     extractKey: "hallucinations" },
        { id: "psych_mania",      text: "Have you had periods of feeling unusually energetic, needing very little sleep?", extractKey: "decreasedSleepNeed" },
        { id: "psych_homicidal",  text: "Have you had any thoughts of hurting someone else?",                            extractKey: "homicidalIdeation" },
      ],
    },
    {
      phase: "pmh",
      questions: [
        { id: "psych_prior_attempt", text: "Have you ever attempted to hurt yourself in the past?",             extractKey: "priorAttempt" },
        { id: "psych_dx",            text: "Have you been diagnosed with any mental health conditions before?",  extractKey: "knownPsychDx" },
        { id: "psych_meds",          text: "Are you currently taking any medications — psychiatric or otherwise?", extractKey: "currentMedications" },
      ],
    },
  ],
  redFlags: [
    { id: "psych_si_high",    label: "Active suicidal ideation with plan",  severity: "critical", match: st => !!(s(st).activePlan && s(st).intent) },
    { id: "psych_homicidal",  label: "Homicidal ideation",                  severity: "critical", match: st => !!(s(st).homicidalIdeation) },
    { id: "psych_psychosis",  label: "Active psychosis",                    severity: "high",     match: st => !!(s(st).hallucinations || s(st).delusions) },
  ],
  computeTriage: assessPsychiatric,
};
