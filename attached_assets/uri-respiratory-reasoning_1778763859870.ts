/**
 * AURALYN — Multi-Track Clinical Reasoning Engine
 * URI / Respiratory Complaint Pack
 * 
 * This file defines how Auralyn processes a complex respiratory encounter
 * like the one described. The key insight: run PARALLEL reasoning tracks,
 * not a single linear decision tree.
 * 
 * File: server/kb/complaintPacks/uri-respiratory.ts
 */

// ─── THE CORE ARCHITECTURE INSIGHT ────────────────────────────────────────
//
// A real physician runs these tracks SIMULTANEOUSLY during one encounter:
//
//   Track 1: What is the diagnosis? (URI, pharyngitis, sinusitis, pneumonia, bronchitis)
//   Track 2: What is the severity?  (mild, moderate, severe, ER now)
//   Track 3: Is this patient high-risk? (age, comorbidities, prior pneumonia)
//   Track 4: What is the antibiotic decision? (no/yes/hold/contingency)
//   Track 5: What comorbidities change the plan? (asthma in this case)
//   Track 6: What is the patient's prior pattern? (bronchitis hx, Z-pack hx)
//   Track 7: Workflow items (pharmacy, work note, return precautions)
//
// Auralyn resolves all 7 tracks in parallel, then synthesizes a plan.
// ──────────────────────────────────────────────────────────────────────────

import { ClinicalState } from "../ClinicalStateBuilder";
import { KBEngine } from "../KBEngine";

// ─── TRACK 1: DIAGNOSIS CLUSTERING ────────────────────────────────────────

export interface DiagnosisCluster {
  primary: string;
  confidence: number;        // 0–1
  icd10: string;
  secondaryDiagnoses: string[];
  ruledOut: string[];
}

export function resolveDiagnosis(state: ClinicalState): DiagnosisCluster {
  const s = state.symptoms;
  const vitals = state.vitals;
  const history = state.history;

  // Pneumonia signals (from the encounter: CXR showed infiltrate, age 82,
  // productive cough, fever, dysphagia)
  const pneumoniaScore = [
    s.cough && s.productivePhlegm ? 2 : 0,
    vitals.fever ? 2 : 0,
    history.age >= 65 ? 2 : 0,           // age is an independent pneumonia risk factor
    s.dyspnea ? 1 : 0,
    s.fatigue && s.bodyAches ? 1 : 0,
    history.cxrFindings?.includes("infiltrate") ? 3 : 0,
    history.hadPneumoniaBefore ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Pharyngitis / strep signals (Centor criteria)
  const centorScore = computeCentor(state);

  // Sinusitis signals
  const sinusitisScore = [
    s.sinusCongestion ? 2 : 0,
    s.nasalDrainage ? 1 : 0,
    s.facialPain ? 2 : 0,
    s.symptomDuration >= 7 ? 1 : 0,      // chronic sinusitis threshold
    s.worseAfterInitialImprovement ? 2 : 0, // "got better then worse" = bacterial
  ].reduce((a, b) => a + b, 0);

  // Bronchitis signals
  const bronchitisScore = [
    s.cough && !s.sinusCongestion ? 2 : 0,
    s.chestTightness ? 1 : 0,
    history.priorBronchitis ? 2 : 0,
    history.usuallyGetsZpack ? 1 : 0,    // patient's own pattern recognition
  ].reduce((a, b) => a + b, 0);

  // Determine primary diagnosis
  const scores = {
    "Community-acquired pneumonia": pneumoniaScore,
    "Acute pharyngitis": centorScore,
    "Acute sinusitis": sinusitisScore,
    "Acute bronchitis": bronchitisScore,
    "Viral upper respiratory infection": 3, // baseline — always in differential
  };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][0];
  const maxScore = sorted[0][1];

  return {
    primary,
    confidence: Math.min(maxScore / 8, 0.95),
    icd10: getICD10(primary),
    secondaryDiagnoses: sorted
      .slice(1)
      .filter(([, score]) => score >= 2)
      .map(([dx]) => dx),
    ruledOut: [
      ...(state.tests.strepNegative ? ["Streptococcal pharyngitis"] : []),
      ...(state.tests.fluNegative ? ["Influenza"] : []),
      ...(state.tests.covidNegative ? ["COVID-19"] : []),
    ],
  };
}

// ─── CENTOR SCORE (pharyngitis / strep) ────────────────────────────────────
// Centor criteria: tonsillar exudate, tender anterior cervical lymph nodes,
// fever, absence of cough. Age-modified (McIsaac).

export function computeCentor(state: ClinicalState): number {
  const s = state.symptoms;
  const age = state.history.age;

  let score = 0;
  if (s.tonsilllarExudate) score += 1;
  if (s.tenderAnteriorNodes) score += 1;
  if (state.vitals.fever) score += 1;
  if (!s.cough) score += 1;           // absence of cough is a positive criterion

  // McIsaac age modifier
  if (age < 15) score += 1;
  if (age >= 45) score -= 1;

  return score;
}

// ─── TRACK 2: SEVERITY ASSESSMENT ─────────────────────────────────────────

export type SeverityLevel = "mild" | "moderate" | "severe" | "er_now";

export interface SeverityResult {
  level: SeverityLevel;
  drivers: string[];       // what pushed the severity up
  erTriggers: string[];    // anything that would mandate ER referral
}

export function assessSeverity(state: ClinicalState): SeverityResult {
  const s = state.symptoms;
  const vitals = state.vitals;
  const erTriggers: string[] = [];
  const drivers: string[] = [];

  // Hard ER triggers (Safety Veto Agent fires on these)
  if (vitals.o2sat && vitals.o2sat < 92)
    erTriggers.push("O2 saturation < 92%");
  if (vitals.respiratoryRate && vitals.respiratoryRate > 30)
    erTriggers.push("Respiratory rate > 30");
  if (s.stridor)
    erTriggers.push("Stridor — possible epiglottitis");
  if (s.drooling)
    erTriggers.push("Drooling — possible epiglottitis");
  if (vitals.bp && vitals.bp.systolic < 90)
    erTriggers.push("Hypotension — possible sepsis");
  if (s.alteredMentalStatus)
    erTriggers.push("Altered mental status");
  if (s.neckStiffness)
    erTriggers.push("Neck stiffness — rule out meningitis");

  if (erTriggers.length > 0) {
    return { level: "er_now", drivers: erTriggers, erTriggers };
  }

  // Severity drivers (accumulate to moderate/severe)
  let severityPoints = 0;

  if (s.dysphagia) { drivers.push("Dysphagia (painful swallowing)"); severityPoints += 2; }
  if (s.dyspnea) { drivers.push("Dyspnea at rest"); severityPoints += 2; }
  if (vitals.fever && vitals.temp >= 103) { drivers.push("High fever ≥103°F"); severityPoints += 2; }
  if (vitals.fever && vitals.temp >= 100.4) { drivers.push("Fever"); severityPoints += 1; }
  if (s.nocturnalCough) { drivers.push("Nighttime cough disrupting sleep"); severityPoints += 1; }
  if (state.history.age >= 65) { drivers.push("Age ≥65 — high-risk population"); severityPoints += 2; }
  if (state.history.age >= 80) { drivers.push("Age ≥80 — very high-risk"); severityPoints += 1; }
  if (s.symptomsWorsening) { drivers.push("Symptoms worsening after initial improvement"); severityPoints += 2; }

  const level: SeverityLevel =
    severityPoints >= 6 ? "severe" :
    severityPoints >= 3 ? "moderate" : "mild";

  return { level, drivers, erTriggers: [] };
}

// ─── TRACK 3: HIGH-RISK PATIENT MODIFIERS ─────────────────────────────────
// These change the ENTIRE clinical plan — not just one recommendation.

export interface RiskProfile {
  isHighRisk: boolean;
  riskFactors: string[];
  xrayIndicated: boolean;
  xrayRationale: string;
  lowerAbxThreshold: boolean;   // whether to recommend abx at lower symptom burden
}

export function assessRisk(state: ClinicalState): RiskProfile {
  const age = state.history.age;
  const riskFactors: string[] = [];

  if (age >= 65) riskFactors.push("Age ≥65");
  if (age >= 80) riskFactors.push("Age ≥80 — highest pneumonia mortality risk");
  if (state.history.immunocompromised) riskFactors.push("Immunocompromised");
  if (state.history.copd) riskFactors.push("COPD");
  if (state.history.heartFailure) riskFactors.push("Heart failure");
  if (state.history.diabetes) riskFactors.push("Diabetes");
  if (state.history.hadPneumoniaBefore) riskFactors.push("Prior pneumonia");
  if (state.history.smoker) riskFactors.push("Smoker");

  // Chest X-ray indication logic — matches your clinical reasoning exactly:
  // Age ≥65 with respiratory symptoms → X-ray
  // Prior pneumonia + similar symptoms → X-ray
  // Productive cough + fever + dyspnea in any age → consider X-ray
  // Young healthy adult with uncomplicated URI → no X-ray
  const xrayIndicated = (
    age >= 65 ||
    state.history.hadPneumoniaBefore ||
    (state.symptoms.cough && state.vitals.fever && state.symptoms.dyspnea)
  );

  return {
    isHighRisk: riskFactors.length > 0,
    riskFactors,
    xrayIndicated,
    xrayRationale: xrayIndicated
      ? age >= 65
        ? `Age ${age} — chest X-ray indicated to rule out pneumonia in older adults with respiratory symptoms`
        : "Productive cough + fever + dyspnea pattern warrants X-ray regardless of age"
      : "Clinical picture consistent with uncomplicated URI — X-ray not indicated",
    lowerAbxThreshold: age >= 65 || state.history.immunocompromised || state.history.copd,
  };
}

// ─── TRACK 4: ANTIBIOTIC DECISION ─────────────────────────────────────────
// This is the most complex track. Multiple pathways, all defensible.

export type AbxDecision =
  | "no_abx"
  | "abx_now"
  | "contingency_abx"   // "fill this if not better in X days"
  | "delayed_abx"       // "wait 1 week before filling"
  | "hold_for_culture"; // wait for strep culture result

export interface AbxRecommendation {
  decision: AbxDecision;
  rationale: string;
  antibiotics?: AntibiticChoice[];
  waitInstruction?: string;
  stewardshipNote?: string;
}

export interface AntibiticChoice {
  name: string;
  dose: string;
  duration: string;
  indication: string;
  pediatricDose?: string;
}

export function decideAntibiotic(
  state: ClinicalState,
  diagnosis: DiagnosisCluster,
  severity: SeverityResult,
  risk: RiskProfile
): AbxRecommendation {

  const s = state.symptoms;
  const history = state.history;
  const centorScore = computeCentor(state);

  // ── Definitive abx indications ──────────────────────────────────────────

  // Pneumonia on CXR → abx now (no discussion needed)
  if (history.cxrFindings?.includes("infiltrate")) {
    return {
      decision: "abx_now",
      rationale: "CXR infiltrate consistent with pneumonia — antibiotic therapy indicated",
      antibiotics: pneumoniaAntibiotics(state),
    };
  }

  // Centor ≥3 in age 15–30 → treat without culture
  if (centorScore >= 3 && state.history.age >= 15 && state.history.age <= 30) {
    return {
      decision: "abx_now",
      rationale: `Centor score ${centorScore} in young adult — empiric strep treatment indicated`,
      antibiotics: strepAntibiotics(state),
    };
  }

  // Uvula swollen / peritonsillar concern → abx now
  if (s.uvulaEnlarged) {
    return {
      decision: "abx_now",
      rationale: "Uvular swelling — empiric antibiotic therapy indicated",
      antibiotics: strepAntibiotics(state),
    };
  }

  // Got better then got worse → bacterial superinfection likely
  if (s.worseAfterInitialImprovement) {
    return {
      decision: "abx_now",
      rationale: "Symptom pattern (improved then worsened) consistent with bacterial superinfection",
      antibiotics: selectBestAntibiotic(diagnosis, state),
    };
  }

  // Yellow/green phlegm ≥7 days → bacterial sinusitis likely
  if (s.coloredPhlegm && s.symptomDuration >= 7) {
    return {
      decision: "abx_now",
      rationale: `Colored phlegm for ${s.symptomDuration} days — bacterial sinusitis duration threshold met`,
      antibiotics: sinusitisAntibiotics(state),
    };
  }

  // Patient pattern recognition: "always get bronchitis" or "Z-pack always works"
  if (history.usuallyGetsZpack || history.priorBronchitis) {
    return {
      decision: "abx_now",
      rationale: "Patient's prior established pattern of bronchitis responding to antibiotics",
      antibiotics: selectBestAntibiotic(diagnosis, state),
      stewardshipNote: "Prescribing based on patient's established clinical pattern. Standard URI without this history would not warrant antibiotics.",
    };
  }

  // High-risk patient with moderate+ severity → lower threshold
  if (risk.lowerAbxThreshold && severity.level !== "mild") {
    return {
      decision: "abx_now",
      rationale: `High-risk patient (${risk.riskFactors.join(", ")}) with ${severity.level} symptoms — antibiotic threshold lowered`,
      antibiotics: selectBestAntibiotic(diagnosis, state),
    };
  }

  // ── Contingency/delayed abx indications ──────────────────────────────────

  // Patient requests abx but no strong indication yet — give contingency
  if (history.patientRequestedAbx && s.symptomDuration < 7) {
    return {
      decision: "delayed_abx",
      rationale: "No clear bacterial indication at this time. Prescribing antibiotic to hold.",
      antibiotics: selectBestAntibiotic(diagnosis, state),
      waitInstruction: "Fill this prescription only if symptoms do not begin to improve within 7 days, or if phlegm remains thick and colored, or if fever returns after going away.",
      stewardshipNote: "No medical indication for antibiotics at this visit. Prescribing contingency prescription per patient preference and shared decision-making.",
    };
  }

  // Centor 2 — borderline — offer culture or empiric treat
  if (centorScore === 2) {
    return {
      decision: "hold_for_culture",
      rationale: "Centor score 2 — intermediate risk. Rapid strep negative but culture pending.",
      waitInstruction: "We will call you if the culture is positive and arrange an antibiotic at that time.",
    };
  }

  // No indication
  return {
    decision: "no_abx",
    rationale: "Clinical picture consistent with viral URI. Tests negative. Antibiotics would not be beneficial at this time.",
    stewardshipNote: "No antibiotic prescribed. Return precautions provided.",
  };
}

// ─── TRACK 5: COMORBIDITY MANAGEMENT (ASTHMA EXAMPLE) ────────────────────
// Each comorbidity gets its own sub-plan, synthesized into the final plan.

export interface AsthmaPlan {
  currentControl: "well_controlled" | "partially_controlled" | "uncontrolled";
  recommendations: string[];
  prescriptions: string[];
}

export function assessAsthma(state: ClinicalState): AsthmaPlan | null {
  if (!state.history.asthma) return null;

  const albuterolFrequency = state.history.albuterolUsagePerDay ?? 0;
  const hasSpaces = state.history.hasSpacs;
  const hasSecondInhaler = state.history.hasSecondInhaler;
  const erVisitsForAsthma = state.history.erVisitsAsthma12mo ?? 0;
  const nocturnalSymptoms = state.symptoms.nocturnalCough || state.symptoms.nocturnalDyspnea;

  // NAEPP classification
  let currentControl: AsthmaPlan["currentControl"];
  if (albuterolFrequency <= 2 && !nocturnalSymptoms) {
    currentControl = "well_controlled";
  } else if (albuterolFrequency <= 3 || nocturnalSymptoms) {
    currentControl = "partially_controlled";
  } else {
    currentControl = "uncontrolled";
  }

  const recommendations: string[] = [];
  const prescriptions: string[] = [];

  // Spacer — always if none
  if (!hasSpaces) {
    recommendations.push("Add spacer — improves lung deposition 2–4x, especially with metered-dose inhalers");
    prescriptions.push("Spacer / valved holding chamber");
  }

  // Step up therapy if not well controlled
  if (currentControl !== "well_controlled") {
    prescriptions.push("Inhaled corticosteroid (ICS) — e.g. fluticasone 110mcg 2 puffs BID");
    recommendations.push("ICS is the preferred controller medication — reduces exacerbations and ER visits");
  }

  // Nighttime symptoms → add LABA or consider combination
  if (nocturnalSymptoms) {
    prescriptions.push("Consider ICS/LABA combination — e.g. fluticasone/salmeterol");
    recommendations.push("Nighttime symptoms suggest need for long-acting bronchodilator");
  }

  // Nebulizer for acute illness
  if (state.diagnosis?.primary.includes("respiratory") || state.symptoms.dyspnea) {
    prescriptions.push("Levalbuterol nebulizer solution — stronger than albuterol MDI for acute illness");
    recommendations.push("Nebulizer with levalbuterol for nighttime use during this acute illness");
    recommendations.push("Can also nebulize with normal saline — moist air helps loosen mucus");
  }

  // Smoking cessation if smoker (would be here)
  if (state.history.smoker) {
    recommendations.push("Smoking cessation counseling — offer varenicline or NRT");
    prescriptions.push("Varenicline (Chantix) or nicotine replacement therapy");
  }

  return { currentControl, recommendations, prescriptions };
}

// ─── TRACK 6: PEDIATRIC MODIFIERS ─────────────────────────────────────────

export function applyPediatricModifiers(
  state: ClinicalState,
  plan: TreatmentPlan
): TreatmentPlan {
  const age = state.history.age;
  if (age >= 18) return plan; // not pediatric

  // No chest X-ray in children without strong indication
  if (age < 18 && !state.symptoms.dyspnea && !state.vitals.o2satLow) {
    plan.imaging = plan.imaging.filter(i => i !== "Chest X-ray");
    plan.imagingRationale.push("Chest X-ray not routinely indicated in children with uncomplicated URI");
  }

  // Weight-based dosing for antibiotics
  plan.antibiotics = plan.antibiotics.map(abx => ({
    ...abx,
    dose: abx.pediatricDose
      ? `${abx.pediatricDose} (weight-based: ${state.history.weightKg}kg)`
      : abx.dose,
  }));

  // Adjust antihistamines/decongestants — not in children < 4
  if (age < 4) {
    plan.otcRecommendations = plan.otcRecommendations.filter(
      r => !r.includes("pseudoephedrine") && !r.includes("diphenhydramine")
    );
    plan.otcRecommendations.push("No OTC cough/cold medications in children under 4 — honey for cough if >1yo");
  }

  return plan;
}

// ─── TRACK 7: SYMPTOM MANAGEMENT SYNTHESIS ────────────────────────────────
// Mirrors Dr. Thomas's end-of-visit treatment options menu.

export function buildSymptomManagementPlan(state: ClinicalState): string[] {
  const plans: string[] = [];
  const s = state.symptoms;
  const age = state.history.age;

  // Sore throat / pharyngitis pain
  if (s.sorethroat && s.dysphagia) {
    plans.push("Acetaminophen 500–1000mg every 6 hours for throat pain");
    plans.push("Ibuprofen 400–600mg every 6–8 hours alternating with acetaminophen for better pain control");
    plans.push("Option: Magic mouthwash or viscous lidocaine for severe throat pain (short-term)");
    plans.push("Option: Single-dose dexamethasone 10mg — reduces throat pain within 12 hours");
  }

  // Cough
  if (s.cough) {
    plans.push("Benzonatate 200mg 3x daily for cough suppression — do not chew");
    plans.push("Guaifenesin/DXM (Mucinex DM) — thins secretions and suppresses cough");
    plans.push("Option: Honey 1–2 teaspoons at bedtime (evidence-based for cough, especially pediatric)");
  }

  // Sinus congestion
  if (s.sinusCongestion) {
    plans.push("Pseudoephedrine 30mg every 4–6 hours, up to 120mg/day — best OTC decongestant");
    plans.push("Saline nasal irrigation (Neti pot or NeilMed) — reduces congestion and clears phlegm");
    plans.push("Option: Intranasal corticosteroid spray if allergies contributing (fluticasone nasal)");
  }

  // Fever / body aches
  if (state.vitals.fever || s.bodyAches) {
    plans.push("Acetaminophen or ibuprofen for fever and body aches — alternate for better control");
  }

  // Allergies (contributing to symptoms)
  if (state.history.allergies) {
    plans.push("Continue Claritin (loratadine) — reduces allergic component of congestion");
    plans.push("Consider adding nasal steroid spray for allergy-driven nasal symptoms");
  }

  // Hydration
  plans.push("Push fluids — 8+ glasses water daily. Warm liquids (tea, broth) help soothe throat");

  // Smoking cessation (only if smoker)
  if (state.history.smoker) {
    plans.push("Smoking cessation: varenicline (Chantix) or nicotine replacement — offer referral");
  }

  return plans;
}

// ─── FINAL PLAN SYNTHESIZER ────────────────────────────────────────────────
// Combines all 7 tracks into a structured output for physician review.

export interface TreatmentPlan {
  diagnosis: DiagnosisCluster;
  severity: SeverityResult;
  riskProfile: RiskProfile;
  antibioticDecision: AbxRecommendation;
  asthmaPlan: AsthmaPlan | null;
  imaging: string[];
  imagingRationale: string[];
  symptomManagement: string[];
  otcRecommendations: string[];
  antibiotics: AntibiticChoice[];
  workflowItems: string[];     // pharmacy, work note, follow-up
  returnPrecautions: string[];
  chartNote: string;           // auto-generated SOAP note
}

export function synthesizePlan(state: ClinicalState): TreatmentPlan {
  const diagnosis = resolveDiagnosis(state);
  const severity = assessSeverity(state);
  const risk = assessRisk(state);
  const abxDecision = decideAntibiotic(state, diagnosis, severity, risk);
  const asthmaPlan = assessAsthma(state);

  const imaging: string[] = [];
  const imagingRationale: string[] = [];

  if (risk.xrayIndicated) {
    imaging.push("Chest X-ray");
    imagingRationale.push(risk.xrayRationale);
  }

  // Apply pediatric modifiers
  let plan: TreatmentPlan = {
    diagnosis,
    severity,
    riskProfile: risk,
    antibioticDecision: abxDecision,
    asthmaPlan,
    imaging,
    imagingRationale,
    symptomManagement: buildSymptomManagementPlan(state),
    otcRecommendations: [],
    antibiotics: abxDecision.antibiotics ?? [],
    workflowItems: buildWorkflowItems(state),
    returnPrecautions: buildReturnPrecautions(state, severity),
    chartNote: "",  // generated by GPT-4o chart note agent
  };

  return applyPediatricModifiers(state, plan);
}

// ─── RETURN PRECAUTIONS (critical for safety) ─────────────────────────────

function buildReturnPrecautions(state: ClinicalState, severity: SeverityResult): string[] {
  const precautions = [
    "Return immediately or call 911 if: difficulty breathing, lips turning blue, severe chest pain, confusion, unable to swallow at all",
    "Return to urgent care if: fever rises above 103°F, symptoms significantly worsen, no improvement after 48–72 hours",
  ];

  if (state.history.age >= 65) {
    precautions.push("Return if: confusion, falls, very low appetite, or any new symptom — elderly patients can deteriorate quickly");
  }

  if (state.history.asthma) {
    precautions.push("If inhaler provides no relief or you need it more often than every 4 hours, go to the ER");
  }

  return precautions;
}

function buildWorkflowItems(state: ClinicalState): string[] {
  const items: string[] = [];
  if (state.preferences.pharmacy) items.push(`Send prescriptions to: ${state.preferences.pharmacy}`);
  if (state.preferences.needsWorkNote) items.push("Generate work/school note");
  items.push("Schedule follow-up if not improved in 5–7 days");
  return items;
}

// ─── ANTIBIOTIC SELECTION HELPERS ─────────────────────────────────────────

function pneumoniaAntibiotics(state: ClinicalState): AntibiticChoice[] {
  const age = state.history.age;
  const allergies = state.history.medicationAllergies ?? [];
  const hasPCNAllergy = allergies.some(a =>
    a.toLowerCase().includes("penicillin") || a.toLowerCase().includes("amoxicillin")
  );

  if (hasPCNAllergy) {
    return [{
      name: "Azithromycin (Z-pack)",
      dose: "500mg day 1, then 250mg days 2–5",
      duration: "5 days",
      indication: "Community-acquired pneumonia — PCN allergy",
    }];
  }

  // Standard CAP: amoxicillin + azithromycin for atypical coverage
  return [
    {
      name: "Amoxicillin-clavulanate",
      dose: age >= 65 ? "875/125mg twice daily" : "500/125mg three times daily",
      duration: "7–10 days",
      indication: "Community-acquired pneumonia — primary antibiotic",
      pediatricDose: "40mg/kg/day divided every 8 hours",
    },
    {
      name: "Azithromycin",
      dose: "500mg day 1, then 250mg days 2–5",
      duration: "5 days",
      indication: "Atypical pneumonia coverage (Mycoplasma, Chlamydophila)",
    },
  ];
}

function strepAntibiotics(state: ClinicalState): AntibiticChoice[] {
  const allergies = state.history.medicationAllergies ?? [];
  const hasPCNAllergy = allergies.some(a =>
    a.toLowerCase().includes("penicillin") || a.toLowerCase().includes("amoxicillin")
  );

  if (hasPCNAllergy) {
    return [{
      name: "Azithromycin",
      dose: "500mg day 1, then 250mg days 2–5",
      duration: "5 days",
      indication: "Streptococcal pharyngitis — PCN allergy",
      pediatricDose: "12mg/kg/day",
    }];
  }

  return [{
    name: "Amoxicillin",
    dose: "500mg twice daily",
    duration: "10 days",
    indication: "Streptococcal pharyngitis",
    pediatricDose: "50mg/kg/day divided BID, max 500mg",
  }];
}

function sinusitisAntibiotics(state: ClinicalState): AntibiticChoice[] {
  return [{
    name: "Amoxicillin-clavulanate",
    dose: "875/125mg twice daily",
    duration: "7–10 days",
    indication: "Bacterial sinusitis — symptoms ≥7 days with colored drainage",
    pediatricDose: "40mg/kg/day divided every 12 hours",
  }];
}

function selectBestAntibiotic(
  diagnosis: DiagnosisCluster,
  state: ClinicalState
): AntibiticChoice[] {
  if (diagnosis.primary.includes("pneumonia")) return pneumoniaAntibiotics(state);
  if (diagnosis.primary.includes("pharyngitis")) return strepAntibiotics(state);
  if (diagnosis.primary.includes("sinusitis")) return sinusitisAntibiotics(state);
  // Bronchitis / undifferentiated
  return sinusitisAntibiotics(state); // amox-clav covers both
}

function getICD10(diagnosis: string): string {
  const map: Record<string, string> = {
    "Community-acquired pneumonia": "J18.9",
    "Acute pharyngitis": "J02.9",
    "Acute sinusitis": "J01.90",
    "Acute bronchitis": "J20.9",
    "Viral upper respiratory infection": "J06.9",
  };
  return map[diagnosis] ?? "J06.9";
}
