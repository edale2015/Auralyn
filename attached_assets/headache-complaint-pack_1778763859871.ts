/**
 * AURALYN — Headache Complaint Pack
 *
 * Core architecture insight: headache reasoning is SUBTRACTIVE, not additive.
 * Every other complaint pack asks "what does the patient have?"
 * This pack first asks "what dangerous thing must we rule out?"
 *
 * Clinical framework:
 *   Layer 1 — Thunderclap screen (worst-of-life = ER, no exceptions)
 *   Layer 2 — Danger signal screen (8 red flags, any = escalate)
 *   Layer 3 — Age-gated targeted questions (IIH, GCA, preeclampsia)
 *   Layer 4 — Special history screen (PE/anticoagulant/hydrocephalus)
 *   Layer 5 — Pattern identification (migraine / tension / sinus / cluster)
 *   Layer 6 — Modifier assessment (frequency, duration, prior Dx, triggers)
 *   Layer 7 — Treatment menu synthesis (physician selects combination)
 *
 * File: server/kb/complaintPacks/headache.ts
 */

import { ClinicalState } from "../ClinicalStateBuilder";

// ─── TYPES ────────────────────────────────────────────────────────────────

export type HeadacheDisposition =
  | "ambulance_now"       // thunderclap, severe neuro deficit, meningismus
  | "er_now"              // danger signal present, imaging needed
  | "ent_today"           // ENT same day (rare — not typical for headache)
  | "neurology_referral"  // frequent / severe / changing pattern
  | "treat_and_watch"     // pattern identified, no danger signals, treat
  | "watchful_waiting";   // mild, clear trigger, reassurance appropriate

export type HeadachePattern =
  | "migraine"
  | "tension"
  | "sinus_headache"
  | "cluster"
  | "medication_overuse"
  | "cervicogenic"        // neck-driven
  | "new_daily_persistent"
  | "undifferentiated";

export interface HeadacheAssessment {
  disposition: HeadacheDisposition;
  dangerSignals: DangerSignal[];
  ambulanceRequired: boolean;
  pattern: HeadachePattern;
  patternConfidence: "high" | "moderate" | "low";
  treatmentPlan: HeadacheTreatmentPlan;
  specialConsiderations: SpecialConsideration[];
  referralRecommended: boolean;
  referralUrgency: "routine" | "urgent" | "emergent" | null;
  patientExplanation: string;
  returnPrecautions: string[];
}

export interface DangerSignal {
  name: string;
  targetDiagnosis: string;
  escalationLevel: "ambulance" | "er" | "urgent_imaging";
  present: boolean;
}

export interface SpecialConsideration {
  condition: string;
  managementChange: string;
}

export interface HeadacheTreatmentPlan {
  immediateRelief: TreatmentOption[];   // what to give now in office
  bridgeTherapy: TreatmentOption[];     // take-home for the next 24-72h
  preventive: TreatmentOption[];        // if frequent headaches
  adjunctTherapy: TreatmentOption[];    // non-pharmacologic
  avoidList: string[];                  // specifically what not to give
}

export interface TreatmentOption {
  name: string;
  dose: string;
  route: "oral" | "IM" | "intranasal" | "topical" | "IV";
  indication: string;
  caveat: string | null;
  pediatricDose: string | null;
}

// ─── LAYER 1: THUNDERCLAP SCREEN ─────────────────────────────────────────
/**
 * The single most important question in headache evaluation.
 * "Worst headache of your life" OR "hit me like a thunderclap"
 * = subarachnoid hemorrhage until CT head + LP proves otherwise.
 * There are no exceptions. Normal neuro exam does NOT rule out SAH.
 */
export function isThunderclapHeadache(state: ClinicalState): boolean {
  const s = state.symptoms;
  return (
    s.worstHeadacheOfLife === true ||
    s.suddenOnsetMaximum === true ||  // reached maximum intensity in <1 minute
    (s.onsetTiming === "thunderclap") ||
    (s.painScore >= 9 && s.onsetType === "sudden")
  );
}

// ─── LAYER 2: DANGER SIGNAL SCREEN ───────────────────────────────────────

export function screenDangerSignals(state: ClinicalState): DangerSignal[] {
  const s = state.symptoms;
  const h = state.history;
  const v = state.vitals;

  return [
    {
      name: "Fever with headache",
      targetDiagnosis: "Bacterial meningitis / viral encephalitis",
      escalationLevel: "er",
      present: !!(v?.fever && v?.temp >= 100.4 && s.headache),
    },
    {
      name: "Neck stiffness / meningismus",
      targetDiagnosis: "Meningitis — Kernig/Brudzinski signs",
      escalationLevel: "ambulance",
      present: !!(s.neckStiffness && !s.neckPain),  // distinguish from tension neck pain
    },
    {
      name: "Neurological deficit",
      targetDiagnosis: "Stroke / intracranial mass / herniation",
      escalationLevel: "ambulance",
      present: !!(s.focalWeakness || s.speechDifficulty || s.facialDroop ||
                  s.visionLoss || s.ataxia || s.dysphagia),
    },
    {
      name: "Altered mental status / confusion",
      targetDiagnosis: "Encephalitis / CO poisoning / SAH",
      escalationLevel: "ambulance",
      present: !!(s.confusion || s.alteredMentalStatus || s.agitation),
    },
    {
      name: "Petechial / purpuric rash",
      targetDiagnosis: "Meningococcemia — life-threatening within hours",
      escalationLevel: "ambulance",
      present: !!(s.rash && (s.rashType === "petechial" || s.rashType === "purpuric")),
    },
    {
      name: "Visual changes / eye pain",
      targetDiagnosis: "Acute angle-closure glaucoma / papilledema / GCA",
      escalationLevel: "er",
      present: !!(s.eyePain || s.visionChanges || s.visualDisturbance),
    },
    {
      name: "Recent head trauma",
      targetDiagnosis: "Subdural / epidural hematoma — delayed presentation possible",
      escalationLevel: "er",
      present: !!(h.recentHeadTrauma || s.headTrauma),
    },
    {
      name: "Possible carbon monoxide exposure",
      targetDiagnosis: "CO poisoning — especially if others in household affected",
      escalationLevel: "er",
      present: !!(
        (h.carbonMonoxideDetectorAlarm) ||
        (s.othersInHouseholdSameSymptoms && !h.carbonMonoxideDetectors) ||
        (s.headacheWorseIndoors && s.headacheBetterOutdoors)
      ),
    },
    {
      name: "New headache in age > 50",
      targetDiagnosis: "Intracranial mass / GCA / subdural",
      escalationLevel: "er",
      present: !!(h.age > 50 && h.newHeadachePattern && !h.priorMigraineHistory),
    },
    {
      name: "Immunocompromised with headache",
      targetDiagnosis: "Cryptococcal meningitis / CNS lymphoma / toxoplasmosis",
      escalationLevel: "er",
      present: !!(h.immunocompromised && s.headache),
    },
    {
      name: "Headache with Valsalva / exertion / positional",
      targetDiagnosis: "Chiari malformation / intracranial mass / CSF leak",
      escalationLevel: "er",
      present: !!(s.headacheWithCough || s.headacheWithExertion || s.headacheWorseSupine),
    },
  ];
}

// ─── LAYER 3: AGE-GATED TARGETED QUESTIONS ───────────────────────────────
/**
 * These questions are age-specific because they target diagnoses
 * that are strongly age-associated. Asking them universally wastes time
 * and may confuse patients. The extractor fires them based on age.
 */

export interface AgeGatedFindings {
  // Under 40: Idiopathic Intracranial Hypertension (pseudotumor cerebri)
  iihSuspicion: boolean;
  iihFeatures: string[];

  // Over 50: Giant Cell Arteritis (temporal arteritis)
  gcaSuspicion: boolean;
  gcaFeatures: string[];

  // Any age if female and reproductive: Preeclampsia
  preeclampsiaSuspicion: boolean;

  // Any age: Prior intracranial pathology changes everything
  priorIntracranialHistory: boolean;
  intracranialHistoryDetails: string[];
}

export function assessAgeGatedFindings(state: ClinicalState): AgeGatedFindings {
  const s = state.symptoms;
  const h = state.history;
  const age = h.age ?? 0;

  // IIH — young, often overweight women; pulsatile tinnitus is pathognomonic
  const iihFeatures: string[] = [];
  if (s.pulsatileTinnitus) iihFeatures.push("Pulsatile tinnitus — high specificity for IIH");
  if (s.transientVisualObscurations) iihFeatures.push("Transient visual obscurations — papilledema sign");
  if (s.headacheBehindEyes) iihFeatures.push("Retro-orbital pressure component");
  if (h.obesity && !h.male) iihFeatures.push("Obese female — primary IIH risk group");
  if (h.recentTetracycline || h.recentVitaminA || h.recentOralContraceptive) {
    iihFeatures.push("IIH-associated medication exposure");
  }

  // GCA — over 50, temple pain, jaw claudication is pathognomonic
  // Must not miss: causes irreversible blindness if untreated
  const gcaFeatures: string[] = [];
  if (age >= 50) {
    if (s.temporalHeadache) gcaFeatures.push("Temporal / scalp tenderness");
    if (s.jawClaudicaton) gcaFeatures.push("JAW CLAUDICATION — pathognomonic for GCA");
    if (s.visionChanges) gcaFeatures.push("Visual symptoms — threatened vision");
    if (s.scalptenderness) gcaFeatures.push("Scalp tenderness on palpation");
    if (h.polymyalgiaRheumatica) gcaFeatures.push("Prior PMR — 50% develop GCA");
    if (s.fevers && s.weightLoss) gcaFeatures.push("Constitutional symptoms — vasculitis pattern");
  }

  // Preeclampsia — any reproductive-age female with headache + hypertension
  const preeclampsiaSuspicion = !!(
    h.pregnant &&
    ((state.vitals?.bp?.systolic ?? 0) >= 140 || (state.vitals?.bp?.diastolic ?? 0) >= 90) &&
    s.headache
  );

  // Prior intracranial history — completely changes management
  const priorIntracranialHistory = !!(
    h.priorSAH || h.priorAVMrepair || h.priorIntracranialAneurysm ||
    h.priorHydrocephalus || h.vpShunt || h.priorCNStumor
  );
  const intracranialHistoryDetails: string[] = [];
  if (h.priorSAH) intracranialHistoryDetails.push("Prior SAH — any new severe headache requires CT");
  if (h.priorIntracranialAneurysm) intracranialHistoryDetails.push("Known aneurysm — sentinel headache concern");
  if (h.vpShunt || h.priorHydrocephalus) intracranialHistoryDetails.push("VP shunt / hydrocephalus — shunt malfunction possible");
  if (h.priorCNStumor) intracranialHistoryDetails.push("Prior CNS tumor — recurrence or new lesion");

  return {
    iihSuspicion: iihFeatures.length >= 2 && age < 50,
    iihFeatures,
    gcaSuspicion: gcaFeatures.length >= 1 && age >= 50,
    gcaFeatures,
    preeclampsiaSuspicion,
    priorIntracranialHistory,
    intracranialHistoryDetails,
  };
}

// ─── LAYER 4: SPECIAL HISTORY MODIFIERS ──────────────────────────────────
/**
 * These comorbidities/medications change management even if no danger signal:
 *   - Anticoagulation (Xarelto, Eliquis, warfarin) → lower imaging threshold
 *   - Prior PE → anticoagulant-related headache possible
 *   - Prior intracranial embolism → thrombotic risk
 *   - VP shunt / hydrocephalus → shunt malfunction
 *   - Pregnancy → preeclampsia, limited treatment options
 */
export function identifySpecialConsiderations(
  state: ClinicalState,
  ageGated: AgeGatedFindings
): SpecialConsideration[] {
  const h = state.history;
  const considerations: SpecialConsideration[] = [];

  if (h.onAnticoagulant) {
    considerations.push({
      condition: `Anticoagulation (${h.anticoagulantName ?? "unknown"})`,
      managementChange: "Lower threshold for CT head — intracranial bleeding risk even with minor trauma or spontaneous",
    });
  }
  if (h.priorPE || h.priorDVT) {
    considerations.push({
      condition: "Prior PE/DVT — likely on anticoagulant",
      managementChange: "Confirm anticoagulation status. Headache from anticoagulation is possible. Check BP.",
    });
  }
  if (h.priorIntracranialEmbolism || h.priorStroke) {
    considerations.push({
      condition: "Prior stroke / intracranial embolism",
      managementChange: "Any new headache warrants CT head to exclude recurrent ischemia or hemorrhagic conversion",
    });
  }
  if (h.vpShunt || h.priorHydrocephalus) {
    considerations.push({
      condition: "VP shunt / hydrocephalus history",
      managementChange: "Headache may represent shunt malfunction. Neurosurgery consult / ER if any vomiting, vision change, or ataxia",
    });
  }
  if (h.pregnant) {
    considerations.push({
      condition: "Pregnancy",
      managementChange: "Avoid triptans (Imitrex), NSAIDs after 20 weeks, high-dose steroids. Acetaminophen is safe. Check BP for preeclampsia.",
    });
  }
  if (ageGated.gcaSuspicion) {
    considerations.push({
      condition: "Giant cell arteritis suspected (age ≥50 + temporal features)",
      managementChange: "Start high-dose prednisone BEFORE biopsy if vision threatened. ESR/CRP. Urgent ophthalmology or rheumatology.",
    });
  }
  if (ageGated.iihSuspicion) {
    considerations.push({
      condition: "Idiopathic intracranial hypertension suspected",
      managementChange: "MRI/MRV brain. Ophthalmology for formal papilledema assessment. Acetazolamide is first-line.",
    });
  }

  return considerations;
}

// ─── LAYER 5: PATTERN IDENTIFICATION ─────────────────────────────────────

export function identifyHeadachePattern(state: ClinicalState): {
  pattern: HeadachePattern;
  confidence: "high" | "moderate" | "low";
  features: string[];
} {
  const s = state.symptoms;
  let features: string[] = [];

  // Migraine scoring
  let migraineScore = 0;
  if (s.unilateral) { migraineScore += 2; features.push("Unilateral"); }
  if (s.pulsatingQuality) { migraineScore += 2; features.push("Pulsating/throbbing quality"); }
  if (s.nausea || s.vomiting) { migraineScore += 1; features.push("Nausea/vomiting"); }
  if (s.photophobia) { migraineScore += 1; features.push("Photophobia"); }
  if (s.phonophobia) { migraineScore += 1; features.push("Phonophobia"); }
  if (s.aura) { migraineScore += 2; features.push("Aura (visual/sensory)"); }
  if (s.worseWithActivity) { migraineScore += 1; features.push("Worse with physical activity"); }
  if (s.headacheDuration >= 4) { migraineScore += 1; }

  // Tension scoring
  let tensionScore = 0;
  if (s.bilateral && !s.unilateral) { tensionScore += 2; }
  if (s.pressingQuality || s.tighteningQuality) { tensionScore += 2; features.push("Pressing/tightening quality"); }
  if (!s.nausea && !s.vomiting) tensionScore += 1;
  if (!s.photophobia && !s.phonophobia) tensionScore += 1;
  if (s.neckPain || s.neckTightness) { tensionScore += 2; features.push("Neck pain/tightness"); }
  if (!s.worseWithActivity) tensionScore += 1;

  // Sinus headache scoring
  let sinusScore = 0;
  if (s.frontalLocation || s.facialPressure) { sinusScore += 2; features.push("Frontal/facial pressure location"); }
  if (s.sinusCongestion) { sinusScore += 2; features.push("Nasal congestion"); }
  if (s.nasalDischarge) { sinusScore += 1; }
  if (s.worseBending) { sinusScore += 2; features.push("Worse when bending forward"); }
  if (s.recentURI || s.recentAllergies) { sinusScore += 1; }

  // Cluster (rare but important to recognize)
  let clusterScore = 0;
  if (s.strictlyUnilateral && s.periorbital) { clusterScore += 3; }
  if (s.tearing || s.rhinorrhea || s.miosis || s.ptosis) { clusterScore += 2; }
  if (s.duration15to180min && s.multiplePerDay) { clusterScore += 2; }
  if (state.history.male && state.history.age >= 20 && state.history.age <= 40) { clusterScore += 1; }

  // Medication overuse
  if ((state.history.analgesicDaysPerMonth ?? 0) >= 10) {
    return {
      pattern: "medication_overuse",
      confidence: "high",
      features: [`Analgesic use ≥${state.history.analgesicDaysPerMonth} days/month — rebound headache pattern`],
    };
  }

  // New daily persistent — new pattern, continuous from onset
  if (state.symptoms.headacheDuration >= 7 && state.history.newHeadachePattern && !state.history.priorMigraineHistory) {
    return {
      pattern: "new_daily_persistent",
      confidence: "moderate",
      features: ["New continuous headache lasting days — NDPH pattern. Requires workup."],
    };
  }

  const scores = {
    migraine: migraineScore,
    tension: tensionScore,
    sinus_headache: sinusScore,
    cluster: clusterScore,
  };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topPattern = sorted[0][0] as HeadachePattern;
  const topScore = sorted[0][1];

  const confidence: "high" | "moderate" | "low" =
    topScore >= 6 ? "high" : topScore >= 3 ? "moderate" : "low";

  return { pattern: topPattern, confidence, features };
}

// ─── LAYER 6: TREATMENT MENU ──────────────────────────────────────────────
/**
 * Dr. Thomas's framework: present options, physician selects combination.
 * Different patterns get different menus.
 * Pregnancy, liver disease, and renal failure modify the menu.
 */
export function buildTreatmentPlan(
  pattern: HeadachePattern,
  state: ClinicalState,
  considerations: SpecialConsideration[]
): HeadacheTreatmentPlan {
  const h = state.history;
  const isPregnant = h.pregnant ?? false;
  const hasLiverDisease = h.liverDisease ?? false;
  const isElderly = (h.age ?? 0) >= 65;
  const isFrequent = (h.headachesPerMonth ?? 0) >= 4;
  const avoidList: string[] = [];

  // Pregnancy restrictions
  if (isPregnant) {
    avoidList.push("Triptans (Imitrex/sumatriptan) — avoid in pregnancy");
    avoidList.push("NSAIDs after 20 weeks gestation — premature ductus closure risk");
    avoidList.push("High-dose corticosteroids — avoid in first trimester");
    avoidList.push("Ergotamines — contraindicated in pregnancy");
  }

  // ── IMMEDIATE RELIEF (in-office) ─────────────────────────────────────
  const immediateRelief: TreatmentOption[] = [];

  // IM injection — most effective for acute migraine in office
  if (!isPregnant) {
    immediateRelief.push({
      name: "Prochlorperazine (Compazine) IM",
      dose: "10mg IM",
      route: "IM",
      indication: "Acute migraine abortive — stops headache and nausea, often within 30 min",
      caveat: "Pre-medicate with diphenhydramine 25mg IM to prevent akathisia (restlessness)",
      pediatricDose: "0.13mg/kg IM, max 10mg",
    });
    immediateRelief.push({
      name: "Ketorolac (Toradol) IM",
      dose: "30mg IM (15mg if age >65 or weight <50kg)",
      route: "IM",
      indication: "Strong NSAID — excellent for tension and sinus headache components",
      caveat: "Avoid if renal insufficiency, GI ulcer, or NSAIDs contraindicated",
      pediatricDose: "0.5mg/kg IM, max 30mg",
    });
  }

  // ── BRIDGE THERAPY (take-home) ────────────────────────────────────────
  const bridgeTherapy: TreatmentOption[] = [];

  // Analgesic foundation — safe universally
  bridgeTherapy.push({
    name: "Acetaminophen + Ibuprofen alternating",
    dose: "Acetaminophen 1000mg + Ibuprofen 600mg together, then alternate every 4-6h",
    route: "oral",
    indication: "First-line combination — synergistic effect better than either alone",
    caveat: hasLiverDisease ? "Reduce acetaminophen to 500mg given liver disease" : null,
    pediatricDose: "Weight-based per package insert",
  });

  // Pattern-specific additions
  if (pattern === "migraine") {
    if (!isPregnant) {
      bridgeTherapy.push({
        name: "Sumatriptan (Imitrex)",
        dose: "50-100mg oral at onset, may repeat once after 2h. Max 200mg/day",
        route: "oral",
        indication: "Migraine-specific triptan — most effective if taken early in attack",
        caveat: "Do not use if cardiovascular disease, hemiplegic migraine, or within 24h of ergotamine. Avoid if using MAOIs.",
        pediatricDose: null,
      });
    }
    bridgeTherapy.push({
      name: "Prednisone burst",
      dose: "60mg once daily x 3 days (or methylprednisolone dose pack)",
      route: "oral",
      indication: "Status migrainosus (>72h migraine) — breaks the cycle",
      caveat: isPregnant ? "Avoid first trimester" : "Short course — minimal systemic risk",
      pediatricDose: "1-2mg/kg/day max 60mg x 3-5 days",
    });
  }

  if (pattern === "tension" || pattern === "cervicogenic") {
    bridgeTherapy.push({
      name: "Cyclobenzaprine (Flexeril)",
      dose: "5mg or 10mg at bedtime",
      route: "oral",
      indication: "Muscle relaxer for tension/cervicogenic headache with neck tightness",
      caveat: "Causes significant sedation — do not drive. Take at bedtime. Avoid in elderly (fall risk).",
      pediatricDose: null,
    });
  }

  if (pattern === "sinus_headache") {
    bridgeTherapy.push({
      name: "Pseudoephedrine",
      dose: "30-60mg every 4-6h. Max 240mg/day",
      route: "oral",
      indication: "Decongestant for sinus component",
      caveat: "Avoid if hypertension, cardiac arrhythmia, or MAOIs",
      pediatricDose: null,
    });
    bridgeTherapy.push({
      name: "Fluticasone nasal spray",
      dose: "2 sprays each nostril daily",
      route: "intranasal",
      indication: "Sinus / allergic component — reduces mucosal inflammation",
      caveat: null,
      pediatricDose: "1 spray each nostril daily if age >4",
    });
    if (!isPregnant) {
      bridgeTherapy.push({
        name: "Prednisone burst",
        dose: "40mg daily x 5 days",
        route: "oral",
        indication: "Acute sinusitis with significant inflammation",
        caveat: "Short course appropriate; reduces mucosal swelling rapidly",
        pediatricDose: "1mg/kg/day x 5 days",
      });
    }
  }

  // Caffeine adjunct — works for most headache types
  bridgeTherapy.push({
    name: "Caffeine adjunct",
    dose: "130mg caffeine (2 strong coffees) with analgesic",
    route: "oral",
    indication: "Potentiates analgesic effect — established in migraine and tension",
    caveat: "If overused, caffeine withdrawal itself causes headache",
    pediatricDose: null,
  });

  // ── PREVENTIVE (if frequent) ──────────────────────────────────────────
  const preventive: TreatmentOption[] = [];
  if (isFrequent) {
    preventive.push({
      name: "Amitriptyline",
      dose: "10-25mg at bedtime, titrate to 50-75mg over weeks",
      route: "oral",
      indication: "Migraine/tension prevention — first-line. Also helps sleep.",
      caveat: isElderly ? "Use with caution in elderly — fall risk, anticholinergic" : "Side effects: drowsiness, dry mouth",
      pediatricDose: null,
    });
    preventive.push({
      name: "Propranolol",
      dose: "40mg twice daily, titrate to 120-160mg/day",
      route: "oral",
      indication: "Migraine prevention — first-line especially if hypertension",
      caveat: "Contraindicated: asthma, COPD, bradycardia, diabetes on insulin",
      pediatricDose: null,
    });
    preventive.push({
      name: "Topiramate",
      dose: "25mg at bedtime, titrate slowly to 50-100mg twice daily",
      route: "oral",
      indication: "Migraine prevention — especially if weight loss also desired",
      caveat: "Cognitive side effects ('dopamax'), kidney stones, teratogenic — requires pregnancy test in women of childbearing age",
      pediatricDose: null,
    });
  }

  // ── ADJUNCT / NON-PHARMACOLOGIC ──────────────────────────────────────
  const adjunctTherapy: TreatmentOption[] = [
    {
      name: "Dark quiet room rest",
      dose: "Rest in dark room immediately — reduces sensory input during attack",
      route: "oral",
      indication: "Universal — most effective non-pharmacologic measure for migraine",
      caveat: null,
      pediatricDose: null,
    },
    {
      name: "Cold or hot compress",
      dose: "Ice pack to head/neck for tension; warm compress for sinus",
      route: "topical",
      indication: "Temperature therapy — cold for vascular, heat for muscle component",
      caveat: null,
      pediatricDose: null,
    },
    {
      name: "Hydration",
      dose: "32oz water immediately — dehydration is a major headache trigger",
      route: "oral",
      indication: "Universal trigger management",
      caveat: null,
      pediatricDose: null,
    },
  ];

  if (pattern === "tension" || pattern === "cervicogenic") {
    adjunctTherapy.push({
      name: "Physical therapy referral",
      dose: "PT evaluation for cervical spine — if recurring tension/cervicogenic",
      route: "oral",
      indication: "Neck muscle tension and cervical joint dysfunction",
      caveat: null,
      pediatricDose: null,
    });
  }

  return {
    immediateRelief,
    bridgeTherapy,
    preventive,
    adjunctTherapy,
    avoidList,
  };
}

// ─── REFERRAL DECISION ───────────────────────────────────────────────────

export function decideReferral(
  pattern: HeadachePattern,
  state: ClinicalState,
  ageGated: AgeGatedFindings
): { recommended: boolean; urgency: "routine" | "urgent" | "emergent" | null; rationale: string } {
  const h = state.history;
  const headachesPerMonth = h.headachesPerMonth ?? 0;
  const hasSevere = state.symptoms.painScore >= 7;
  const hasNewPattern = h.newHeadachePattern ?? false;
  const hasLasted7Plus = (state.symptoms.headacheDuration ?? 0) >= 7;

  // Emergent referral
  if (ageGated.gcaSuspicion) {
    return { recommended: true, urgency: "emergent", rationale: "GCA suspected — ophthalmology/rheumatology today to prevent irreversible vision loss" };
  }
  if (ageGated.iihSuspicion) {
    return { recommended: true, urgency: "urgent", rationale: "IIH suspected — neurology within days for papilledema assessment and acetazolamide" };
  }

  // Urgent referral criteria
  if (hasNewPattern && h.age > 50) {
    return { recommended: true, urgency: "urgent", rationale: "New headache pattern over age 50 — neurology within 1-2 weeks for imaging review" };
  }
  if (hasLasted7Plus) {
    return { recommended: true, urgency: "urgent", rationale: `Headache lasting ${state.symptoms.headacheDuration} days — prolonged course warrants neurology evaluation` };
  }

  // Routine referral criteria — Dr. Thomas's framework
  // "Frequent, long-lasting, severe, or headaches with other symptoms need a specialist"
  const referralDrivers = [
    headachesPerMonth >= 4 && "Frequent headaches (≥4/month)",
    hasSevere && headachesPerMonth >= 2 && "Frequent severe headaches",
    pattern === "cluster" && "Cluster headache — requires specialist management",
    pattern === "medication_overuse" && "Medication overuse headache — requires supervised withdrawal",
    pattern === "new_daily_persistent" && "NDPH — requires neurological workup",
    h.failedTwoPreventives && "Failed multiple preventive medications",
  ].filter(Boolean);

  if (referralDrivers.length > 0) {
    return {
      recommended: true,
      urgency: "routine",
      rationale: `Neurology referral recommended: ${referralDrivers.join("; ")}`,
    };
  }

  return { recommended: false, urgency: null, rationale: "No referral indicated at this time" };
}

// ─── PATIENT EXPLANATION BUILDER ─────────────────────────────────────────

export function buildHeadacheExplanation(
  disposition: HeadacheDisposition,
  dangerSignals: DangerSignal[],
  pattern: HeadachePattern,
  state: ClinicalState
): string {
  if (disposition === "ambulance_now" || disposition === "er_now") {
    const presentSignals = dangerSignals.filter(d => d.present).map(d => d.name);
    return `I need to be honest with you — there are some features of this headache that I can't evaluate fully here and that need immediate imaging. Specifically: ${presentSignals.join(", ")}. I'm sending you to the ER now. This doesn't mean something is definitely wrong, but it does mean I need to rule out something serious before I can treat you.`;
  }

  const patternName = {
    migraine: "migraine",
    tension: "tension headache",
    sinus_headache: "headache from sinus congestion",
    cluster: "cluster headache",
    medication_overuse: "rebound headache from pain medication",
    cervicogenic: "headache coming from neck muscle tension",
    new_daily_persistent: "a new pattern of headache that needs further evaluation",
    undifferentiated: "headache that doesn't fit one clear pattern yet",
  }[pattern];

  const duration = state.symptoms.headacheDuration ?? 1;
  const durationNote = duration >= 7
    ? `I want to be honest — a headache lasting ${duration} days is longer than typical, and that's why I'm also recommending you follow up with a specialist.`
    : "";

  return `I don't see anything emergent here, which is reassuring. The pattern fits most closely with a ${patternName}. ${durationNote} I have several options to help you right now and some things to take home. I'll walk you through each option and you can tell me what you'd like.`;
}

// ─── MASTER SYNTHESIZER ──────────────────────────────────────────────────

export function assessHeadache(state: ClinicalState): HeadacheAssessment {
  // Layer 1 — Thunderclap
  if (isThunderclapHeadache(state)) {
    return {
      disposition: "ambulance_now",
      dangerSignals: [],
      ambulanceRequired: true,
      pattern: "undifferentiated",
      patternConfidence: "low",
      treatmentPlan: { immediateRelief: [], bridgeTherapy: [], preventive: [], adjunctTherapy: [], avoidList: [] },
      specialConsiderations: [],
      referralRecommended: false,
      referralUrgency: "emergent",
      patientExplanation: "This headache came on suddenly and reached maximum intensity very quickly. That pattern requires immediate evaluation for bleeding in the brain. We are calling 911 now.",
      returnPrecautions: [],
    };
  }

  // Layer 2 — Danger signals
  const dangerSignals = screenDangerSignals(state);
  const activeDangerSignals = dangerSignals.filter(d => d.present);
  if (activeDangerSignals.length > 0) {
    const needsAmbulance = activeDangerSignals.some(d => d.escalationLevel === "ambulance");
    return {
      disposition: needsAmbulance ? "ambulance_now" : "er_now",
      dangerSignals,
      ambulanceRequired: needsAmbulance,
      pattern: "undifferentiated",
      patternConfidence: "low",
      treatmentPlan: { immediateRelief: [], bridgeTherapy: [], preventive: [], adjunctTherapy: [], avoidList: [] },
      specialConsiderations: [],
      referralRecommended: false,
      referralUrgency: "emergent",
      patientExplanation: buildHeadacheExplanation("er_now", dangerSignals, "undifferentiated", state),
      returnPrecautions: [],
    };
  }

  // Layers 3 & 4 — Age-gated and special considerations
  const ageGated = assessAgeGatedFindings(state);
  const specialConsiderations = identifySpecialConsiderations(state, ageGated);

  // GCA is an emergency even without hard danger signals
  if (ageGated.gcaSuspicion && ageGated.gcaFeatures.some(f => f.includes("JAW CLAUDICATION") || f.includes("Visual"))) {
    return {
      disposition: "er_now",
      dangerSignals,
      ambulanceRequired: false,
      pattern: "undifferentiated",
      patternConfidence: "low",
      treatmentPlan: { immediateRelief: [], bridgeTherapy: [], preventive: [], adjunctTherapy: [], avoidList: [] },
      specialConsiderations,
      referralRecommended: true,
      referralUrgency: "emergent",
      patientExplanation: "The features you're describing — particularly jaw pain and the area of your head that hurts — raise concern for a condition called giant cell arteritis that can cause blindness if not treated immediately. I am starting steroids now and sending you to be seen urgently.",
      returnPrecautions: [],
    };
  }

  // Layers 5 & 6 — Pattern and modifiers
  const { pattern, confidence, features } = identifyHeadachePattern(state);
  const treatmentPlan = buildTreatmentPlan(pattern, state, specialConsiderations);
  const referralDecision = decideReferral(pattern, state, ageGated);

  const disposition: HeadacheDisposition =
    referralDecision.urgency === "emergent" ? "er_now" :
    referralDecision.urgency === "urgent" ? "neurology_referral" :
    "treat_and_watch";

  const returnPrecautions = [
    "Return immediately or call 911 if: sudden severe headache unlike any before, headache with fever and neck stiffness, weakness or numbness in arm/face/leg, confusion, vision loss",
    "Return to urgent care if: headache significantly worsens, new symptoms develop, no improvement after 48 hours of treatment",
  ];
  if (pattern === "new_daily_persistent") {
    returnPrecautions.push("Follow up with neurology within 2 weeks — daily headache lasting more than a week needs imaging and specialist evaluation");
  }

  return {
    disposition,
    dangerSignals,
    ambulanceRequired: false,
    pattern,
    patternConfidence: confidence,
    treatmentPlan,
    specialConsiderations,
    referralRecommended: referralDecision.recommended,
    referralUrgency: referralDecision.urgency,
    patientExplanation: buildHeadacheExplanation(disposition, dangerSignals, pattern, state),
    returnPrecautions,
  };
}

/**
 * EXAMPLE — The patient from Dr. Thomas's transcript:
 *
 * Extracted state:
 *   headache: true, headacheDuration: 7 (days), painScore: 7
 *   nausea: unknown, photophobia: unknown (not asked yet)
 *   neckPain: true (neck really hurts)
 *   frontalLocation: true (over the eyes)
 *   sinusCongestion: possible (frontal)
 *   worstHeadacheOfLife: false (came on gradually)
 *   suddenOnset: false
 *   fever: false, rash: false, confusion: false
 *   neckStiffness: false (neck PAIN, not meningismus)
 *   focalWeakness: false, speechDifficulty: false
 *   eyePain: false
 *   recentHeadTrauma: false
 *   carbonMonoxideDetectors: true
 *   pulsatileTinnitus: false (age < 40 question — asked, negative)
 *   jawClaudicaton: false (age > 50 question — asked, negative here)
 *   headachesPerMonth: 1
 *   pregnant: false (asked)
 *   priorAnticoagulant: false
 *   age: [not stated, assume middle-aged]
 *   priorHydrocephalus: false
 *
 * Assessment:
 *   Thunderclap: NO (gradual onset, not worst of life)
 *   Danger signals: ALL NEGATIVE (no fever, no neck stiffness, no neuro deficit)
 *   Age-gated: No IIH, no GCA (age not >50 clearly), no preeclampsia
 *   Pattern: Undifferentiated — frontal + neck pain suggests TENSION with possible
 *            sinus component. Nausea/photophobia not yet asked (would clarify migraine).
 *            Duration 7 days → New Daily Persistent pattern concern.
 *
 *   Disposition: TREAT AND WATCH + neurology referral (7-day duration = prolonged)
 *
 *   Treatment menu:
 *     Immediate: Prochlorperazine IM + Ketorolac IM
 *     Bridge: Acetaminophen + Ibuprofen, Prednisone burst (frontal sinus)
 *             Cyclobenzaprine for neck component
 *             Sumatriptan if migraine features clarified
 *     Adjunct: Dark room, hydration, ice/heat
 *
 *   Patient explanation (matches Dr. Thomas):
 *     "I don't see anything emergent here, which is reassuring.
 *      A headache lasting 7 days is longer than typical, and that's why
 *      I'm recommending specialist follow-up. I have several options to
 *      help you right now and some things to take home..."
 */
