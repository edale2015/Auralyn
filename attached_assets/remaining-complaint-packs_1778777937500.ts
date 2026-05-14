/**
 * AURALYN — Remaining Complaint Packs
 * MSK · Dermatology · Psychiatric · Pediatric Fever
 *
 * File: server/kb/complaintPacks/remaining-packs.ts
 */

import { ClinicalState } from "../ClinicalStateBuilder";

// ═══════════════════════════════════════════════════════════
// PACK 1: MUSCULOSKELETAL (MSK)
// Core framework: anatomy almost never changes management.
// Red flags drive disposition. Most MSK is self-limiting.
// ═══════════════════════════════════════════════════════════

export function assessMSK(state: ClinicalState): MSKAssessment {
  const s = state.symptoms;
  const h = state.history;
  const exam = state.examFindings;

  // Red flags — these escalate regardless of everything else
  const redFlags: string[] = [];
  if (s.bonyTenderness && h.osteoporosis) redFlags.push("Bony point tenderness in osteoporotic patient — fracture risk");
  if (s.jointSwelling && s.fever) redFlags.push("Hot swollen joint with fever — septic arthritis until proven otherwise");
  if (s.saddle && s.legWeakness) redFlags.push("Saddle anesthesia + leg weakness — cauda equina, neurosurgery NOW");
  if (s.bowelBladderDysfunction) redFlags.push("Bowel/bladder dysfunction with back pain — cauda equina emergency");
  if (s.bonyTenderness && h.cancerHistory) redFlags.push("Bony tenderness with cancer history — metastatic disease");
  if (s.jointSwelling && s.warmth && !s.fever && h.goutHistory) redFlags.push("Acute gout flare — treat without imaging");
  if (exam?.neurovascularCompromise) redFlags.push("Neurovascular compromise — compartment syndrome or vascular injury");

  const disposition: MSKDisposition =
    redFlags.some(r => r.includes("cauda equina") || r.includes("compartment") || r.includes("vascular"))
      ? "ambulance_now"
    : redFlags.some(r => r.includes("septic") || r.includes("fracture") || r.includes("metastatic"))
      ? "er_now"
    : s.inabilityToBearWeight && h.recentTrauma
      ? "imaging_today"
    : redFlags.length > 0
      ? "urgent_care_followup"
    : "treat_and_watch";

  const treatment: MSKTreatment = {
    rest: "Relative rest — avoid activity that worsens pain, but do not immobilize completely",
    ice: s.acuteOnset ? "Ice 20 min on / 20 min off for first 48h" : "Heat or ice — whichever feels better",
    nsaids: "Ibuprofen 400-600mg every 6h with food, OR naproxen 500mg twice daily",
    acetaminophen: "Acetaminophen 1000mg every 6h alternating with ibuprofen for better control",
    muscleRelaxer: (s.muscleSpasm || s.neckPain || s.backPain)
      ? "Cyclobenzaprine 5-10mg at bedtime (sedating — do not drive)"
      : null,
    topical: "Diclofenac gel (Voltaren) or lidocaine patch for localized pain — minimal systemic effect",
    imaging: s.inabilityToBearWeight && h.recentTrauma ? "X-ray to rule out fracture" : "No imaging indicated — anatomy rarely changes management",
    followup: "Physical therapy if not improving in 2-3 weeks",
    returnPrecautions: [
      "Return if: weakness or numbness develops, pain severe and uncontrolled, unable to bear weight",
      "ER if: bowel or bladder problems develop with back pain — this is an emergency",
    ],
  };

  return {
    disposition,
    redFlags,
    treatment,
    keyMessage: "MSK injuries and back pain almost always get better without imaging or surgery. Staying gently active heals faster than rest.",
    imagingRationale: treatment.imaging,
  };
}

export type MSKDisposition = "ambulance_now" | "er_now" | "imaging_today" | "urgent_care_followup" | "treat_and_watch";
export interface MSKAssessment {
  disposition: MSKDisposition;
  redFlags: string[];
  treatment: MSKTreatment;
  keyMessage: string;
  imagingRationale: string;
}
export interface MSKTreatment {
  rest: string; ice: string; nsaids: string; acetaminophen: string;
  muscleRelaxer: string | null; topical: string; imaging: string;
  followup: string; returnPrecautions: string[];
}

// ═══════════════════════════════════════════════════════════
// PACK 2: DERMATOLOGY
// Framework: distribution + morphology + systemic symptoms.
// Most skin conditions are benign. Red flags are specific.
// ═══════════════════════════════════════════════════════════

export function assessDermatology(state: ClinicalState): DermAssessment {
  const s = state.symptoms;
  const h = state.history;

  // Morphology classification
  const morphology = classifyMorphology(s);

  // Immediate red flags
  const redFlags: string[] = [];
  if (s.rashWithFever && s.petechiae) redFlags.push("Petechial rash with fever — meningococcemia, ER now");
  if (s.rapidlySpreading && s.fever && s.skinNecrosis) redFlags.push("Necrotizing fasciitis — surgical emergency, ambulance");
  if (s.hivesFacial && s.dyspnea) redFlags.push("Urticaria + dyspnea — anaphylaxis, epinephrine now");
  if (s.mucosalInvolvement && s.rash) redFlags.push("Mucosal involvement — Stevens-Johnson syndrome concern, ER");
  if (s.bullae && s.widespread) redFlags.push("Widespread bullae — pemphigus or TEN, ER");
  if (s.painfulRash && s.dermatomal) redFlags.push("Dermatomal painful rash — Herpes Zoster (shingles), treat early");
  if (h.diabetes && s.cellulitis && s.fever) redFlags.push("Cellulitis in diabetic with fever — IV antibiotics likely needed");

  const disposition: DermDisposition =
    redFlags.some(r => r.includes("ambulance") || r.includes("anaphylaxis") || r.includes("necrotizing")) ? "ambulance_now"
    : redFlags.some(r => r.includes("ER") || r.includes("Stevens-Johnson") || r.includes("TEN")) ? "er_now"
    : redFlags.some(r => r.includes("IV antibiotics")) ? "er_today"
    : redFlags.length > 0 ? "urgent_care_today"
    : "treat_and_watch";

  // Build diagnosis list
  const differentials: DermDx[] = buildDermDifferential(s, h, morphology);

  // Treatment
  const treatment = buildDermTreatment(differentials[0]?.diagnosis, s, h);

  return {
    disposition,
    redFlags,
    morphology,
    differentials,
    treatment,
    keyMessage: redFlags.length === 0
      ? "Most rashes and skin conditions are not dangerous and respond well to treatment."
      : `Red flags identified: ${redFlags[0]}`,
  };
}

function classifyMorphology(s: any): string {
  if (s.vesicles || s.bullae) return "vesicular";
  if (s.pustules) return "pustular";
  if (s.urticaria || s.hives) return "urticarial";
  if (s.scaly) return "papulosquamous";
  if (s.macules) return "macular";
  if (s.papules) return "papular";
  if (s.nodules) return "nodular";
  if (s.purpura || s.petechiae) return "purpuric";
  return "unclassified";
}

function buildDermDifferential(s: any, h: any, morphology: string): DermDx[] {
  const dx: DermDx[] = [];
  if (morphology === "urticarial") dx.push({ diagnosis: "Urticaria (hives)", icd10: "L50.9", probability: "high", treatment: "Antihistamine ± steroids" });
  if (s.dermatomal && s.painful) dx.push({ diagnosis: "Herpes Zoster (shingles)", icd10: "B02.9", probability: "high", treatment: "Valacyclovir 1g TID x 7d — start within 72h of onset" });
  if (morphology === "vesicular" && !s.dermatomal) dx.push({ diagnosis: "Contact dermatitis", icd10: "L23.9", probability: "moderate", treatment: "Topical steroid + identify/remove trigger" });
  if (s.wellDemarcatedRed && s.warm && s.tender) dx.push({ diagnosis: "Cellulitis", icd10: "L03.90", probability: "high", treatment: "Cephalexin 500mg QID x 5d or Bactrim if MRSA risk" });
  if (morphology === "papulosquamous" && s.silveryScale) dx.push({ diagnosis: "Psoriasis", icd10: "L40.0", probability: "moderate", treatment: "Topical steroids + dermatology referral" });
  if (s.ringLike && s.centralClearing) dx.push({ diagnosis: "Tinea (ringworm)", icd10: "B35.4", probability: "high", treatment: "Clotrimazole or terbinafine topical x 2-4 weeks" });
  if (s.mite && h.householdContacts) dx.push({ diagnosis: "Scabies", icd10: "B86", probability: "moderate", treatment: "Permethrin 5% cream — treat all household contacts simultaneously" });
  return dx.length > 0 ? dx : [{ diagnosis: "Undifferentiated rash — needs further evaluation", icd10: "R21", probability: "undetermined", treatment: "Dermatology referral" }];
}

function buildDermTreatment(primaryDx: string | undefined, s: any, h: any): string[] {
  const tx: string[] = [];
  if (!primaryDx || primaryDx.includes("Undifferentiated")) return ["Dermatology referral recommended for evaluation and diagnosis"];
  if (primaryDx.includes("Zoster")) tx.push("Valacyclovir 1g three times daily x 7 days — most effective if started within 72h", "Pain management: acetaminophen + ibuprofen alternating", "Avoid contact with immunocompromised individuals, pregnant women, and infants until lesions crust");
  if (primaryDx.includes("Cellulitis")) tx.push("Cephalexin 500mg four times daily x 5 days (7 days if not improving)", "Mark the border with a pen to monitor spread", "Elevate the affected area", "Return if: fever, red spreading beyond marked border, increasing pain");
  if (primaryDx.includes("Urticaria")) tx.push("Cetirizine (Zyrtec) 10mg daily or loratadine (Claritin) 10mg daily", "Diphenhydramine (Benadryl) for acute severe symptoms — causes drowsiness", "Prednisone 40mg daily x 5 days if widespread");
  return tx;
}

export type DermDisposition = "ambulance_now" | "er_now" | "er_today" | "urgent_care_today" | "treat_and_watch";
export interface DermDx { diagnosis: string; icd10: string; probability: string; treatment: string; }
export interface DermAssessment {
  disposition: DermDisposition; redFlags: string[]; morphology: string;
  differentials: DermDx[]; treatment: string[]; keyMessage: string;
}

// ═══════════════════════════════════════════════════════════
// PACK 3: PSYCHIATRIC / BEHAVIORAL HEALTH
// Framework: safety first. Suicidality screens immediately.
// Most psychiatric presentations in UC are crisis or exacerbation.
// ═══════════════════════════════════════════════════════════

export function assessPsychiatric(state: ClinicalState): PsychAssessment {
  const s = state.symptoms;
  const h = state.history;

  // Columbia Suicide Severity Rating Scale (C-SSRS) lite
  const suicidalityRisk = assessSuicidality(s, h);
  const homicidalityRisk = s.homicidalIdeation || s.specificThreat;
  const psychosisPresent = s.hallucinations || s.delusions || s.disorganizedSpeech;
  const maniaSigns = s.grandiosity && s.decreasedSleepNeed && s.racingThoughts;

  const redFlags: string[] = [];
  if (suicidalityRisk === "high") redFlags.push("Active suicidal ideation with plan or intent — 1:1 monitoring, ER");
  if (homicidalityRisk) redFlags.push("Homicidal ideation — safety assessment, ER, duty to warn");
  if (psychosisPresent) redFlags.push("Active psychosis — antipsychotic evaluation needed");
  if (maniaSigns) redFlags.push("Manic episode signs — mood stabilizer assessment");
  if (s.alteredMentalStatus && !s.knownPsychDx) redFlags.push("AMS in patient without psych history — rule out organic cause first");

  const disposition: PsychDisposition =
    suicidalityRisk === "high" || homicidalityRisk ? "er_now_1to1"
    : psychosisPresent || maniaSigns ? "er_today"
    : suicidalityRisk === "moderate" ? "crisis_center_today"
    : "outpatient_followup";

  return {
    disposition,
    suicidalityRisk,
    redFlags,
    crisisResources: [
      "988 Suicide and Crisis Lifeline — call or text 988",
      "Crisis Text Line — text HOME to 741741",
      "Nearest ER if in immediate danger",
    ],
    safetyPlan: suicidalityRisk !== "none" ? buildSafetyPlan(h) : null,
    keyMessage: suicidalityRisk !== "none"
      ? "Your safety is the most important thing right now. We are here to help."
      : "We hear you. Mental health is health. Let's get you connected to the right support.",
  };
}

function assessSuicidality(s: any, h: any): "none" | "low" | "moderate" | "high" {
  if (s.activePlan && s.intent) return "high";
  if (s.activeIdeation && s.plan) return "high";
  if (s.activeIdeation && h.priorAttempt) return "high";
  if (s.activeIdeation) return "moderate";
  if (s.passiveIdeation) return "low";
  return "none";
}

function buildSafetyPlan(h: any): string[] {
  return [
    "Warning signs: " + (h.suicidalityWarningSign || "identify your personal warning signs"),
    "Internal coping strategies: things you can do on your own",
    "Social contacts who can provide distraction",
    "People you can ask for help",
    "Professionals to contact in crisis — 988, your therapist, ER",
    "Making the environment safe: remove access to means",
  ];
}

export type PsychDisposition = "er_now_1to1" | "er_today" | "crisis_center_today" | "outpatient_followup";
export interface PsychAssessment {
  disposition: PsychDisposition; suicidalityRisk: string; redFlags: string[];
  crisisResources: string[]; safetyPlan: string[] | null; keyMessage: string;
}

// ═══════════════════════════════════════════════════════════
// PACK 4: PEDIATRIC FEVER
// Framework: age-stratified risk. Under 3 months = ER always.
// Source of fever drives workup. Fever itself is not dangerous.
// ═══════════════════════════════════════════════════════════

export function assessPediatricFever(state: ClinicalState): PedsFeverAssessment {
  const s = state.symptoms;
  const h = state.history;
  const v = state.vitals;
  const age = h.age;           // in months for pediatric
  const ageMonths = h.ageMonths ?? age * 12;
  const temp = v?.temp ?? 0;
  const weightKg = h.weightKg;

  // Age-stratified immediate rules
  const redFlags: string[] = [];

  // Under 3 months — all fever is ER
  if (ageMonths < 3 && temp >= 100.4) {
    redFlags.push("Fever in infant under 3 months — ER immediately regardless of appearance");
  }

  // 3-6 months — high risk
  if (ageMonths >= 3 && ageMonths < 6 && temp >= 102.2) {
    redFlags.push("High fever in 3-6 month old — close evaluation needed");
  }

  // Sepsis signs at any age
  if (s.poorPerfusion || s.mottledSkin || s.extremeIrritability || s.inconsolable) {
    redFlags.push("Signs of sepsis or serious bacterial illness — ER");
  }

  // Meningitis signs
  if (s.neckStiffness || s.petechialRash || s.bulging && ageMonths < 18) {
    redFlags.push("Bulging fontanelle or meningeal signs — ER now");
  }

  // Febrile seizure
  if (s.seizureWithFever) {
    if (s.firstFebrileSeizure) redFlags.push("First febrile seizure — ER for evaluation");
    else redFlags.push("Febrile seizure — evaluate per prior workup");
  }

  const disposition: PedsFeverDisposition =
    ageMonths < 3 && temp >= 100.4 ? "er_now"
    : redFlags.some(r => r.includes("ER now") || r.includes("ER immediately") || r.includes("sepsis")) ? "er_now"
    : redFlags.some(r => r.includes("ER for evaluation")) ? "er_today"
    : s.poorOralIntake && s.noWetDiapers ? "er_today"  // dehydration risk
    : "treat_and_watch";

  // Weight-based dosing
  const dosing = weightKg ? {
    acetaminophen: `${Math.round(weightKg * 15)}mg (15mg/kg) every 4-6h — max 5 doses/24h`,
    ibuprofen: ageMonths >= 6
      ? `${Math.round(weightKg * 10)}mg (10mg/kg) every 6-8h with food`
      : "NOT for use under 6 months",
  } : {
    acetaminophen: "15mg/kg every 4-6 hours (ask pharmacist for dose)",
    ibuprofen: ageMonths >= 6 ? "10mg/kg every 6-8 hours" : "Not for use under 6 months",
  };

  return {
    disposition,
    redFlags,
    ageRiskCategory: ageMonths < 3 ? "high" : ageMonths < 6 ? "moderate" : "standard",
    dosing,
    parentCounseling: [
      "Fever itself does not cause brain damage — it is the body fighting infection",
      "The goal is comfort, not a normal temperature",
      "Alternate acetaminophen and ibuprofen every 3 hours for better control",
      "Push fluids: Pedialyte, diluted juice, popsicles, breastmilk",
      "Watch how your child acts more than the number on the thermometer",
    ],
    returnPrecautions: [
      "Return immediately: cannot wake child, difficulty breathing, rash, seizure, limp or floppy",
      "Return today: fever lasts more than 3 days, fever returns after going away, child not drinking",
      "Under 3 months with any fever — ER always, no exceptions",
    ],
    keyMessage: ageMonths < 3
      ? "Any fever in a baby under 3 months requires emergency evaluation — this is always the rule."
      : "Most childhood fevers are viral and get better on their own. Keeping your child comfortable and hydrated is the priority.",
  };
}

export type PedsFeverDisposition = "er_now" | "er_today" | "treat_and_watch";
export interface PedsFeverAssessment {
  disposition: PedsFeverDisposition; redFlags: string[];
  ageRiskCategory: "high" | "moderate" | "standard";
  dosing: { acetaminophen: string; ibuprofen: string };
  parentCounseling: string[]; returnPrecautions: string[]; keyMessage: string;
}

// ═══════════════════════════════════════════════════════════
// PACK 5: EYE COMPLAINTS
// Framework: visual acuity is the vital sign of the eye.
// Red flags: sudden vision loss, chemical exposure, penetrating injury.
// ═══════════════════════════════════════════════════════════

export function assessEyeComplaint(state: ClinicalState): EyeAssessment {
  const s = state.symptoms;
  const h = state.history;

  const redFlags: string[] = [];
  if (s.suddenVisionLoss) redFlags.push("Sudden vision loss — retinal emergency, ophthalmology NOW");
  if (s.chemicalExposure) redFlags.push("Chemical eye exposure — irrigate immediately, ER");
  if (s.penetratingTrauma) redFlags.push("Penetrating eye trauma — do NOT press on eye, ER with eye shield");
  if (s.eyePain && s.nausea && s.halos) redFlags.push("Acute angle-closure glaucoma — ophthalmology emergency");
  if (s.proptosis) redFlags.push("Proptosis — orbital cellulitis or mass, ER");
  if (s.afferentPupilaryDefect) redFlags.push("APD present — optic nerve or retinal pathology, urgent ophthalmology");

  const disposition: EyeDisposition =
    redFlags.some(r => r.includes("NOW") || r.includes("ER")) ? "er_now"
    : redFlags.length > 0 ? "ophthalmology_today"
    : s.eyeRedness && !s.visionChange ? "treat_and_watch"  // likely conjunctivitis
    : "urgent_care_today";

  const likelyConjunctivitis = s.eyeRedness && !s.visionChange && !s.eyePain && s.discharge;
  const likelyViralURI = likelyConjunctivitis && (s.cough || s.sorethroat);

  return {
    disposition,
    redFlags,
    likelyDiagnosis: likelyConjunctivitis
      ? likelyViralURI ? "Viral conjunctivitis (associated with URI)" : "Bacterial conjunctivitis"
      : "Further evaluation needed",
    treatment: likelyConjunctivitis ? [
      "Antibiotic eye drops (polymyxin/trimethoprim or erythromycin ointment) if bacterial pattern",
      "Viral conjunctivitis: supportive care only — cool compresses, artificial tears",
      "Do not wear contact lenses until resolved",
      "Wash hands frequently — conjunctivitis is highly contagious",
      "Avoid sharing towels or pillowcases",
    ] : [],
    keyMessage: likelyConjunctivitis
      ? "Pink eye is very common and usually clears in 7-10 days. Your vision is not at risk."
      : "Eye symptoms can range from minor to serious. The key concern is whether your vision is affected.",
    diagramType: "eye_anatomy",
  };
}

export type EyeDisposition = "er_now" | "ophthalmology_today" | "urgent_care_today" | "treat_and_watch";
export interface EyeAssessment {
  disposition: EyeDisposition; redFlags: string[]; likelyDiagnosis: string;
  treatment: string[]; keyMessage: string; diagramType: string;
}

// ── Register all packs in resolveComplaintPackDirect ────────────────────
// Add these cases to kbResolver.ts:
//
// case "msk_back_pain":
// case "msk_joint_pain":
// case "msk_injury":
//   return assessMSK(state);
//
// case "derm_rash":
// case "derm_skin_complaint":
//   return assessDermatology(state);
//
// case "psych_anxiety":
// case "psych_depression":
// case "psych_crisis":
//   return assessPsychiatric(state);
//
// case "peds_fever":
// case "pediatric_fever":
//   return assessPediatricFever(state);
//
// case "eye_redness":
// case "eye_complaint":
// case "conjunctivitis":
//   return assessEyeComplaint(state);
