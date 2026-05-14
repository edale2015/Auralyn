/**
 * AURALYN — Chest Pain Complaint Pack
 * 
 * Core clinical framework: "Story and Risk — if either is concerning, ER."
 * These are TWO INDEPENDENT GATES. A patient with a low-risk story but
 * multiple cardiac risk factors still goes to the ER. A young healthy patient
 * with a textbook ACS story still goes to the ER.
 * 
 * File: server/kb/complaintPacks/chest-pain.ts
 */

import { ClinicalState } from "../ClinicalStateBuilder";

// ─── TYPES ────────────────────────────────────────────────────────────────

export type ChestPainDisposition =
  | "ambulance_now"      // ST elevation, looks unwell, hemodynamically unstable
  | "er_now"             // concerning story OR risk — self-transport or car
  | "urgent_care_workup" // low story + low risk — EKG, CXR, troponin if available
  | "observation"        // borderline — serial troponin, monitor
  | "reassurance";       // clearly musculoskeletal/positional/reproducible

export interface ChestPainAssessment {
  disposition: ChestPainDisposition;
  storyScore: StoryScore;
  riskScore: RiskScore;
  heartScore: number;           // HEART score (validated ACS risk tool)
  peRiskScore: PERisk;          // PE track runs in parallel
  ekgFindings: EKGFindings;
  ambulanceRequired: boolean;
  erRationale: string[];        // what the system tells the physician
  patientExplanation: string;   // what to say to the patient
  workupOrdered: string[];
  differentialDiagnosis: DifferentialEntry[];
}

export interface StoryScore {
  total: number;                // 0–10
  concerning: boolean;          // true if ≥4
  drivers: string[];
  quality: string | null;
  radiation: boolean;
  worstAtOnset: boolean;
  constant: boolean;
  reproduceableWithPalpation: boolean;
  pleuriticComponent: boolean;  // worse with breathing → PE/pleuritis/pericarditis
  exertionalComponent: boolean; // worse with walking → ACS
}

export interface RiskScore {
  total: number;                // 0–10
  concerning: boolean;          // true if ≥3
  drivers: string[];
  age: number;
  male: boolean;
  diabetes: boolean;
  hypertension: boolean;
  hyperlipidemia: boolean;
  smoker: boolean;
  familyHxMI: boolean;         // first degree relative MI in 50s
  priorMI: boolean;
  priorPCI_CABG: boolean;
  priorCardiacAblation: boolean;
  recentlyStoppedAnticoagulant: boolean;
  cocaine: boolean;
  obesity: boolean;
}

export interface PERisk {
  wellsScore: number;
  percCriteriaMet: boolean;     // if ALL PERC criteria met → PE ruled out
  concerning: boolean;
  drivers: string[];
}

export interface EKGFindings {
  obtained: boolean;
  stElevation: boolean;
  stDepression: boolean;
  tWaveInversion: boolean;
  lbbb: boolean;
  rbbb: boolean;
  afib: boolean;
  normal: boolean;
}

export interface DifferentialEntry {
  diagnosis: string;
  icd10: string;
  probability: "high" | "moderate" | "low";
  urgency: "immediate" | "urgent" | "non-urgent";
  keyFeature: string;
}

// ─── STORY SCORER ────────────────────────────────────────────────────────
// Encodes Dr. Thomas's quality / character / radiation / timing framework.

export function scoreStory(state: ClinicalState): StoryScore {
  const s = state.symptoms;
  const drivers: string[] = [];
  let total = 0;

  // Quality — pressure/squeezing is the most concerning
  const quality = s.painQuality ?? null;
  if (quality === "pressure" || quality === "squeezing" || quality === "tightness") {
    total += 3;
    drivers.push(`Pain quality: "${quality}" — classic anginal descriptor`);
  } else if (quality === "sharp" && s.pleuriticPain) {
    total += 1;
    drivers.push("Sharp pleuritic pain — PE/pericarditis pattern");
  } else if (quality === "burning") {
    total += 1;
    drivers.push("Burning quality — GERD possible, but also inferior MI");
  } else if (quality === "tearing" || quality === "ripping") {
    total += 4;
    drivers.push("TEARING/RIPPING quality — aortic dissection until proven otherwise");
  }

  // Radiation
  const radiation = s.radiation ?? [];
  if (radiation.includes("left_arm") || radiation.includes("both_arms")) {
    total += 2;
    drivers.push("Radiation to arm(s) — classic ACS pattern");
  }
  if (radiation.includes("jaw") || radiation.includes("neck")) {
    total += 2;
    drivers.push("Radiation to jaw/neck — concerning for ACS, especially in women");
  }
  if (radiation.includes("back") && (quality === "tearing" || quality === "ripping")) {
    total += 3;
    drivers.push("Radiation to back + tearing quality — aortic dissection");
  }
  if (radiation.includes("back") && quality !== "tearing") {
    total += 1;
    drivers.push("Radiation to back — less specific, but notable");
  }

  // Severity
  const painScore = s.painScore ?? 0;
  if (painScore >= 8) { total += 2; drivers.push(`Severe pain (${painScore}/10)`); }
  else if (painScore >= 5) { total += 1; drivers.push(`Moderate pain (${painScore}/10)`); }

  // Timing — worst at onset is the most dangerous signal
  if (s.worstAtOnset) {
    total += 3;
    drivers.push("WORST AT ONSET — classic aortic dissection or pulmonary embolism pattern");
  }
  if (s.constant && !s.worstAtOnset) {
    total += 1;
    drivers.push("Constant pain without relief — concerning");
  }

  // Associated symptoms
  if (s.dyspnea) { total += 2; drivers.push("Associated shortness of breath"); }
  if (s.diaphoresis) { total += 3; drivers.push("DIAPHORESIS — high-risk ACS signal, insist on ambulance"); }
  if (s.nausea) { total += 1; drivers.push("Nausea with chest pain — inferior MI pattern"); }
  if (s.syncope) { total += 3; drivers.push("Syncope with chest pain — PE, HOCM, or severe ACS"); }
  if (s.palpitations) { total += 1; drivers.push("Palpitations — arrhythmia possible"); }

  // Reassuring features (reduce score)
  const reproduceableWithPalpation = s.reproduceableWithPalpation ?? false;
  const pleuriticComponent = s.pleuriticPain ?? false;
  const exertionalComponent = s.worseWithExertion ?? false;

  if (reproduceableWithPalpation) {
    // Reproducible with palpation is reassuring for musculoskeletal
    // BUT does NOT rule out ACS — about 15% of ACS patients have this
    total -= 1;
    drivers.push("Reproducible with palpation (reassuring, but does not rule out ACS)");
  }
  if (s.positional && !s.dyspnea) {
    total -= 1;
    drivers.push("Positional component — more consistent with musculoskeletal");
  }
  if (exertionalComponent) {
    total += 1;
    drivers.push("Worse with exertion — anginal pattern");
  }

  total = Math.max(0, Math.min(10, total));

  return {
    total,
    concerning: total >= 4,
    drivers,
    quality,
    radiation: radiation.length > 0,
    worstAtOnset: s.worstAtOnset ?? false,
    constant: s.constant ?? false,
    reproduceableWithPalpation,
    pleuriticComponent,
    exertionalComponent,
  };
}

// ─── RISK SCORER ─────────────────────────────────────────────────────────
// Encodes Dr. Thomas's risk factor framework — Man, DM, HTN, lipids, smoking.

export function scoreRisk(state: ClinicalState): RiskScore {
  const h = state.history;
  const drivers: string[] = [];
  let total = 0;

  const age = h.age ?? 0;
  const male = h.sex === "male";

  // Age + sex (the single biggest modifiers)
  if (male && age >= 55) { total += 2; drivers.push(`Male age ${age} — high cardiac risk baseline`); }
  else if (male && age >= 45) { total += 1; drivers.push(`Male age ${age} — elevated cardiac risk`); }
  else if (!male && age >= 65) { total += 2; drivers.push(`Female age ${age} — cardiac risk rises sharply post-menopause`); }
  else if (!male && age >= 55) { total += 1; drivers.push(`Female age ${age} — increasing cardiac risk`); }
  // Women under 50 with ACS often present atypically — don't under-triage
  if (!male && age < 50 && h.diabetes) {
    total += 1;
    drivers.push("Young woman with diabetes — ACS risk higher than age suggests");
  }

  if (h.diabetes) { total += 2; drivers.push("Diabetes — #1 cardiac risk modifier, can mask typical ACS symptoms"); }
  if (h.hypertension) { total += 1; drivers.push("Hypertension"); }
  if (h.hyperlipidemia) { total += 1; drivers.push("Hyperlipidemia"); }
  if (h.smoker) { total += 2; drivers.push("Active smoker — strong independent cardiac risk factor"); }
  if (h.familyHxMI) { total += 2; drivers.push("Family history of MI in 50s — significant hereditary risk"); }
  if (h.priorMI) { total += 3; drivers.push("PRIOR MI — prior cardiac event dramatically raises current ACS risk"); }
  if (h.priorPCI || h.priorCABG) { total += 2; drivers.push("Prior PCI/CABG — established coronary artery disease"); }
  if (h.priorCardiacAblation) {
    total += 1;
    drivers.push("Prior cardiac ablation — structural cardiac history");
  }
  if (h.recentlyStoppedAnticoagulant) {
    total += 2;
    drivers.push("Recently stopped anticoagulant — increased thrombotic risk");
  }
  if (h.cocaine) { total += 3; drivers.push("Cocaine use — coronary vasospasm, massive ACS risk even in young patients"); }
  if (h.obesity) { total += 1; drivers.push("Obesity — metabolic cardiac risk"); }

  // Recent MI is a near-automatic ambulance trigger
  const daysSinceLastMI = h.daysSinceLastMI ?? Infinity;
  if (daysSinceLastMI < 90) {
    total += 4;
    drivers.push(`Recent MI ${daysSinceLastMI} days ago — extremely high re-infarction risk`);
  }

  total = Math.min(10, total);

  return {
    total,
    concerning: total >= 3,
    drivers,
    age,
    male,
    diabetes: h.diabetes ?? false,
    hypertension: h.hypertension ?? false,
    hyperlipidemia: h.hyperlipidemia ?? false,
    smoker: h.smoker ?? false,
    familyHxMI: h.familyHxMI ?? false,
    priorMI: h.priorMI ?? false,
    priorPCI_CABG: h.priorPCI || h.priorCABG || false,
    priorCardiacAblation: h.priorCardiacAblation ?? false,
    recentlyStoppedAnticoagulant: h.recentlyStoppedAnticoagulant ?? false,
    cocaine: h.cocaine ?? false,
    obesity: h.obesity ?? false,
  };
}

// ─── HEART SCORE ─────────────────────────────────────────────────────────
// Validated ACS risk stratification tool used in emergency medicine.
// H=History E=EKG A=Age R=Risk factors T=Troponin

export function computeHEART(
  story: StoryScore,
  risk: RiskScore,
  ekg: EKGFindings,
  troponinElevated: boolean | null
): number {
  let score = 0;

  // H — History (highly suspicious=2, moderately=1, slightly=0)
  if (story.total >= 6) score += 2;
  else if (story.total >= 3) score += 1;

  // E — EKG
  if (ekg.stElevation || ekg.lbbb) score += 2;
  else if (ekg.stDepression || ekg.tWaveInversion) score += 1;
  else if (ekg.normal) score += 0;

  // A — Age
  if (risk.age >= 65) score += 2;
  else if (risk.age >= 45) score += 1;

  // R — Risk factors (≥3 or prior atherosclerotic disease=2, 1-2 factors=1)
  const riskFactorCount = [
    risk.diabetes, risk.hypertension, risk.hyperlipidemia,
    risk.smoker, risk.familyHxMI, risk.obesity,
  ].filter(Boolean).length;
  if (risk.priorMI || risk.priorPCI_CABG || riskFactorCount >= 3) score += 2;
  else if (riskFactorCount >= 1) score += 1;

  // T — Troponin (elevated=2, 1-3x normal=1, normal=0)
  if (troponinElevated === true) score += 2;
  else if (troponinElevated === null) score += 0; // not yet available

  return score;
}

// ─── PE RISK (Wells + PERC) ──────────────────────────────────────────────

export function assessPERisk(state: ClinicalState): PERisk {
  const s = state.symptoms;
  const h = state.history;
  const drivers: string[] = [];
  let wells = 0;

  if (h.priorPE || h.priorDVT) { wells += 1.5; drivers.push("Prior PE or DVT"); }
  if (s.heartRate && s.heartRate > 100) { wells += 1.5; drivers.push("Heart rate > 100"); }
  if (h.recentSurgery || h.recentImmobilization) { wells += 1.5; drivers.push("Recent surgery/immobilization"); }
  if (s.clinicalDVT) { wells += 3; drivers.push("Clinical DVT signs (calf pain/swelling)"); }
  if (s.calfPain || s.legSwelling) { wells += 1; drivers.push("Calf pain or leg swelling — DVT screen needed"); }
  if (h.recentLongFlight || h.recentLongCarRide) { wells += 1; drivers.push("Recent long travel (>4 hours)"); }
  if (s.hemoptysis) { wells += 1; drivers.push("Hemoptysis"); }
  if (s.pleuriticPain) { wells += 0.5; drivers.push("Pleuritic pain component"); }
  if (h.cancer) { wells += 1; drivers.push("Active cancer — hypercoagulable state"); }
  if (h.copd) { wells += 0.5; drivers.push("COPD — PE risk elevated and can mimic exacerbation"); }
  // Alternative diagnosis LESS likely than PE (clinical judgment)
  if (s.dyspnea && !s.cough && !s.fever) { wells += 1; drivers.push("Dyspnea without other explanation"); }

  // PERC rule — if ALL criteria met, PE can be clinically excluded
  const percCriteriaMet = (
    (s.heartRate ?? 0) < 100 &&
    !h.recentSurgery && !h.recentImmobilization &&
    !h.priorDVT && !h.priorPE &&
    !s.legSwelling && !s.calfPain &&
    !s.hemoptysis &&
    !h.cancer &&
    (state.vitals?.o2sat ?? 100) >= 95 &&
    h.age < 50
  );

  return {
    wellsScore: wells,
    percCriteriaMet,
    concerning: wells >= 2 || (!percCriteriaMet && s.calfPain && h.recentLongFlight),
    drivers,
  };
}

// ─── DISPOSITION DECIDER ─────────────────────────────────────────────────

export function decideChestPainDisposition(
  state: ClinicalState,
  story: StoryScore,
  risk: RiskScore,
  ekg: EKGFindings,
  heartScore: number,
  peRisk: PERisk
): { disposition: ChestPainDisposition; ambulanceRequired: boolean; rationale: string[] } {

  const rationale: string[] = [];

  // ── IMMEDIATE AMBULANCE TRIGGERS (no discussion) ────────────────────────
  if (ekg.stElevation) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: ["ST elevation on EKG — STEMI. Activate cath lab. Call 911 immediately."],
    };
  }
  if (story.diaphoresis) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: ["Diaphoresis with chest pain — autonomic response to massive myocardial ischemia. Ambulance now."],
    };
  }
  if (state.vitals?.o2sat && state.vitals.o2sat < 92) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: [`O2 sat ${state.vitals.o2sat}% — critical hypoxemia. Ambulance now.`],
    };
  }
  if (story.worstAtOnset && (story.quality === "tearing" || story.quality === "ripping")) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: ["Tearing/ripping pain worst at onset — aortic dissection until proven otherwise. Ambulance now."],
    };
  }
  if (state.symptoms?.syncope) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: ["Syncope with chest pain — massive PE, HOCM, or severe ACS. Ambulance now."],
    };
  }
  if (state.history?.daysSinceLastMI && state.history.daysSinceLastMI < 90) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: [`MI within last ${state.history.daysSinceLastMI} days — re-infarction risk extremely high. Ambulance now.`],
    };
  }

  // ── EITHER GATE TRIGGERS ER ─────────────────────────────────────────────
  if (story.concerning) {
    rationale.push("STORY GATE: Presentation features are concerning for ACS or other serious etiology.");
    rationale.push(...story.drivers.map(d => `  • ${d}`));
  }
  if (risk.concerning) {
    rationale.push("RISK GATE: Patient has significant cardiac risk factors.");
    rationale.push(...risk.drivers.map(d => `  • ${d}`));
  }
  if (peRisk.concerning) {
    rationale.push("PE TRACK: Clinical features raise concern for pulmonary embolism.");
    rationale.push(...peRisk.drivers.map(d => `  • ${d}`));
  }
  if (ekg.stDepression || ekg.tWaveInversion || ekg.lbbb) {
    rationale.push("EKG ABNORMALITY: Requires emergent evaluation even if symptoms seem stable.");
  }
  if (heartScore >= 4) {
    rationale.push(`HEART SCORE ${heartScore} — intermediate to high risk for MACE.`);
  }

  if (story.concerning || risk.concerning || peRisk.concerning ||
      ekg.stDepression || ekg.tWaveInversion || ekg.lbbb || heartScore >= 4) {
    // EKG normal + stable vitals → ER but self-transport acceptable
    // EKG abnormal or hemodynamically concerning → ambulance
    const needsAmbulance = ekg.stDepression || ekg.tWaveInversion || ekg.lbbb || heartScore >= 7;
    return {
      disposition: "er_now",
      ambulanceRequired: needsAmbulance,
      rationale,
    };
  }

  // ── BORDERLINE — HEART score 0-3, story and risk both low ──────────────
  if (heartScore <= 3 && story.reproduceableWithPalpation && story.pleuriticComponent) {
    rationale.push("Low HEART score with musculoskeletal/pleuritic features — can manage at urgent care.");
    rationale.push("Serial evaluation, return precautions given.");
    return {
      disposition: "urgent_care_workup",
      ambulanceRequired: false,
      rationale,
    };
  }

  // Default borderline → observation
  rationale.push("Borderline presentation — observe with serial vitals and return precautions.");
  return {
    disposition: "observation",
    ambulanceRequired: false,
    rationale,
  };
}

// ─── DIFFERENTIAL BUILDER ─────────────────────────────────────────────────

export function buildChestPainDifferential(
  story: StoryScore,
  risk: RiskScore,
  peRisk: PERisk,
  ekg: EKGFindings,
  state: ClinicalState
): DifferentialEntry[] {
  const diff: DifferentialEntry[] = [];

  // ACS/NSTEMI/Unstable angina
  if (risk.concerning || story.total >= 3) {
    diff.push({
      diagnosis: "Acute coronary syndrome (NSTEMI/unstable angina)",
      icd10: "I21.9",
      probability: risk.total >= 5 && story.total >= 5 ? "high" : "moderate",
      urgency: "immediate",
      keyFeature: "Pressure quality + cardiac risk factors + EKG",
    });
  }

  // STEMI
  if (ekg.stElevation) {
    diff.push({
      diagnosis: "STEMI",
      icd10: "I21.3",
      probability: "high",
      urgency: "immediate",
      keyFeature: "ST elevation on EKG",
    });
  }

  // Aortic dissection
  if (story.worstAtOnset || story.quality === "tearing" || story.quality === "ripping") {
    diff.push({
      diagnosis: "Aortic dissection",
      icd10: "I71.00",
      probability: story.quality === "tearing" ? "high" : "moderate",
      urgency: "immediate",
      keyFeature: "Tearing quality + worst at onset + back radiation",
    });
  }

  // PE
  if (peRisk.concerning) {
    diff.push({
      diagnosis: "Pulmonary embolism",
      icd10: "I26.99",
      probability: peRisk.wellsScore >= 5 ? "high" : "moderate",
      urgency: "immediate",
      keyFeature: `Wells score ${peRisk.wellsScore} — ${peRisk.drivers[0] ?? "clinical suspicion"}`,
    });
  }

  // Pericarditis
  if (story.pleuriticComponent && state.symptoms?.positionRelief) {
    diff.push({
      diagnosis: "Pericarditis",
      icd10: "I30.9",
      probability: "moderate",
      urgency: "urgent",
      keyFeature: "Pleuritic pain + worse supine + better leaning forward",
    });
  }

  // Musculoskeletal
  if (story.reproduceableWithPalpation) {
    diff.push({
      diagnosis: "Musculoskeletal chest pain (costochondritis)",
      icd10: "M94.0",
      probability: risk.total <= 2 && story.total <= 3 ? "high" : "low",
      urgency: "non-urgent",
      keyFeature: "Reproducible with palpation",
    });
  }

  // GERD / esophageal
  if (story.quality === "burning" && !risk.concerning) {
    diff.push({
      diagnosis: "GERD / esophageal spasm",
      icd10: "K21.0",
      probability: "moderate",
      urgency: "non-urgent",
      keyFeature: "Burning quality + relation to meals + relief with antacids",
    });
  }

  return diff;
}

// ─── WORKUP BUILDER ──────────────────────────────────────────────────────

export function buildChestPainWorkup(
  story: StoryScore,
  risk: RiskScore,
  peRisk: PERisk,
  disposition: ChestPainDisposition
): string[] {
  const workup: string[] = [];

  // Always for chest pain presentation
  workup.push("EKG — immediately on arrival");
  workup.push("O2 saturation — continuous monitoring");
  workup.push("Vital signs — HR, BP both arms if dissection concern");

  if (disposition === "er_now" || disposition === "ambulance_now") {
    workup.push("ER: Serial troponin (0h, 3h) — HEART protocol");
    workup.push("ER: Chest X-ray");
    if (peRisk.concerning) workup.push("ER: CT pulmonary angiography (if PE concern)");
    if (risk.priorMI || risk.concerning) workup.push("ER: Echocardiogram");
    workup.push("Provide written ER referral note with clinical summary");
  } else {
    // Urgent care workup for low-risk presentations
    workup.push("Chest X-ray (urgent care)");
    workup.push("Point-of-care troponin if available");
    if (peRisk.concerning) workup.push("D-dimer if Wells < 2 and PERC not met");
  }

  return workup;
}

// ─── PATIENT EXPLANATION BUILDER ─────────────────────────────────────────
// What Dr. Thomas actually says to the patient — honest, not alarming.

export function buildPatientExplanation(
  story: StoryScore,
  risk: RiskScore,
  ekg: EKGFindings,
  disposition: ChestPainDisposition
): string {
  if (disposition === "ambulance_now") {
    return "I need to be direct with you — what I'm seeing right now is very concerning for a serious heart or vascular problem. We are calling 911 right now. I do not want you to drive yourself. This is not a precaution — this is the right medical decision for you right now.";
  }

  if (disposition === "er_now") {
    const ekgReassurance = ekg.normal
      ? "Your EKG is normal, which is reassuring — it means you don't need to go by ambulance. "
      : "Your EKG has some changes that need further evaluation. ";

    const storyLine = story.concerning
      ? "The way you're describing this pain — " +
        story.drivers.slice(0, 2).map(d => d.split("—")[0].trim().toLowerCase()).join(" and ") +
        " — is the kind of pattern that needs a full cardiac workup. "
      : "";

    const riskLine = risk.concerning
      ? `Given your medical history — ${risk.drivers.slice(0, 2).map(d => d.split("—")[0].trim().toLowerCase()).join(" and ")} — I'm not comfortable letting this go without a complete evaluation. `
      : "";

    return `${ekgReassurance}${storyLine}${riskLine}You need to go to the ER now to get checked properly. They can do blood tests I can't do here, and monitor you over several hours. I'll give you a note to take with you. Do you have a way to get there, or would you like us to arrange transport?`;
  }

  return "Your presentation today looks more consistent with a non-cardiac cause of chest pain. We'll do an EKG and some further evaluation to be sure. I want to go over some warning signs with you so you know when to come right back.";
}

// ─── MASTER SYNTHESIZER ──────────────────────────────────────────────────

export function assessChestPain(
  state: ClinicalState,
  ekg: EKGFindings,
  troponinElevated: boolean | null = null
): ChestPainAssessment {

  const story = scoreStory(state);
  const risk = scoreRisk(state);
  const peRisk = assessPERisk(state);
  const heartScore = computeHEART(story, risk, ekg, troponinElevated);

  const { disposition, ambulanceRequired, rationale } =
    decideChestPainDisposition(state, story, risk, ekg, heartScore, peRisk);

  return {
    disposition,
    storyScore: story,
    riskScore: risk,
    heartScore,
    peRiskScore: peRisk,
    ekgFindings: ekg,
    ambulanceRequired,
    erRationale: rationale,
    patientExplanation: buildPatientExplanation(story, risk, ekg, disposition),
    workupOrdered: buildChestPainWorkup(story, risk, peRisk, disposition),
    differentialDiagnosis: buildChestPainDifferential(story, risk, peRisk, ekg, state),
  };
}

/**
 * EXAMPLE — Mr. Jones from Dr. Thomas's transcript:
 * 
 * State extracted:
 *   age: 64, male: true
 *   painQuality: "pressure"
 *   constant: true, worstAtOnset: false
 *   dyspnea: true
 *   radiation: [] (denied arm/jaw/back)
 *   diaphoresis: false, nausea: false
 *   worseWithExertion: false (denied)
 *   diabetes: true, hypertension: true, hyperlipidemia: true
 *   smoker: false (asked, result not documented — assume asked)
 *   familyHxMI: false
 *   priorCardiacAblation: true
 *   recentlyStoppedAnticoagulant: true (stopped blood thinner this year)
 *   EKG: normal, CXR: clear
 * 
 * Story score: pressure (3) + constant (1) + dyspnea (2) = 6 → CONCERNING
 * Risk score: male 64 (1) + DM (2) + HTN (1) + lipids (1) + ablation (1) + stopped anticoag (2) = 8 → CONCERNING
 * HEART: H=2 (story 6) + E=0 (normal EKG) + A=1 (age 45-64) + R=2 (≥3 risk factors) + T=0 = 5
 * 
 * Disposition: ER NOW (story gate + risk gate both fired)
 * Ambulance: Not required (HEART=5, EKG normal, hemodynamically stable)
 * 
 * Patient explanation: "Your EKG is normal, which is reassuring — it means
 * you don't need to go by ambulance. The way you're describing this pain —
 * pressure quality and shortness of breath — is the kind of pattern that needs
 * a full cardiac workup. Given your medical history — diabetes and recently
 * stopped blood thinner — I'm not comfortable letting this go without a
 * complete evaluation. You need to go to the ER now..."
 */
