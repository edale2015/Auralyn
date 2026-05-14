/**
 * AURALYN — Abdominal Pain Complaint Pack
 *
 * Reasoning style: LOCATION-GATED
 * Location is the primary key that opens the differential.
 * High-risk modifiers lower the ER threshold across ALL quadrants.
 * Severity + constancy + tenderness drive the imaging urgency decision.
 *
 * Core framework (Dr. Thomas):
 *   "The concerning part is the severity, it is constant, and you have
 *    tenderness. Any one of these should be checked out right away."
 *
 * Three-axis disposition system:
 *   Axis 1 — Peritoneal signs? → Ambulance regardless of everything else
 *   Axis 2 — High-risk modifiers? → Lower ER threshold at any quadrant
 *   Axis 3 — Severity + constancy + TTP → CT urgency (ER vs outpatient vs none)
 *
 * Special rules:
 *   - Epigastric → always get EKG (inferior MI presents as epigastric pain)
 *   - UA always — blood, nitrites, ketones, glucose, specific gravity
 *   - No abdominal X-ray or labs if story is consistent with constipation
 *   - Pediatric males — always examine testicles
 *   - Elderly — AAA, mesenteric ischemia, diverticulitis are high prior
 *   - Pregnant — ER for trauma, ectopic, preeclampsia, abruption, HELLP
 *   - GLP-1 medications → gastroparesis, pancreatitis on differential
 *   - Severe pain with MILD tenderness → mesenteric ischemia until proven otherwise
 *
 * File: server/kb/complaintPacks/abdominal-pain.ts
 */

import { ClinicalState } from "../ClinicalStateBuilder";

// ─── TYPES ────────────────────────────────────────────────────────────────

export type AbdomenQuadrant =
  | "RUQ" | "LUQ" | "RLQ" | "LLQ"
  | "epigastric" | "periumbilical" | "suprapubic"
  | "diffuse" | "flank_right" | "flank_left" | "unknown";

export type AbdomenDisposition =
  | "ambulance_now"       // peritoneal signs, AAA rupture, septic shock
  | "er_now"              // severe + constant + TTP, or any high-risk modifier + moderate pain
  | "er_strongly_advised" // patient hesitant, physician insisting
  | "ct_outpatient"       // mild-moderate, stable, needs imaging but not urgent
  | "treat_and_watch"     // clear benign etiology, mild symptoms
  | "watchful_waiting";   // constipation story, no red flags

export interface AbdominalAssessment {
  disposition: AbdomenDisposition;
  ambulanceRequired: boolean;
  peritonealSigns: PeritonealFindings;
  highRiskModifiers: HighRiskModifier[];
  quadrant: AbdomenQuadrant;
  differential: AbdominalDxEntry[];
  workup: AbdominalWorkup;
  treatmentPlan: AbdominalTreatmentPlan;
  imagingDecision: ImagingDecision;
  dispositionRationale: string[];
  patientExplanation: string;
  returnPrecautions: string[];
  medicationFlags: MedicationFlag[];
}

export interface PeritonealFindings {
  rigidity: boolean;
  rebound: boolean;       // pain worse when pressure RELEASED (Blumberg sign)
  guarding: boolean;      // voluntary or involuntary muscle tensing
  boardLike: boolean;     // rigid board = immediate surgical emergency
  peritonealSigns: boolean; // any of the above = true
}

export interface HighRiskModifier {
  name: string;
  clinicalImpact: string;
  lowerERThreshold: boolean;
}

export interface AbdominalDxEntry {
  diagnosis: string;
  icd10: string;
  probability: "high" | "moderate" | "low";
  urgency: "immediate" | "urgent" | "semi-urgent" | "non-urgent";
  keyFeature: string;
  requiresCT: boolean;
  requiresSurgery: boolean;
}

export interface AbdominalWorkup {
  ua: boolean;
  uaRationale: string;
  hcg: boolean;           // pregnancy test
  ekg: boolean;
  ekgRationale: string | null;
  labs: string[];
  imaging: string[];
  examRequired: string[]; // physical exam components explicitly required
  doNotOrder: string[];   // explicitly what NOT to order
}

export interface ImagingDecision {
  ctIndicated: boolean;
  ctUrgency: "er_stat" | "outpatient_today" | "outpatient_routine" | "none";
  ctType: string | null;
  imagingRationale: string;
  xrayIndicated: boolean; // almost never for abdominal pain alone
}

export interface AbdominalTreatmentPlan {
  nauseaMedications: TreatmentOption[];
  painMedications: TreatmentOption[];
  antispasmodics: TreatmentOption[];
  ivFluidCandidate: boolean;
  npoRecommended: boolean;  // nothing by mouth if surgical concern
  dietAdvice: string[];
  antibiotics: TreatmentOption[];
}

export interface TreatmentOption {
  name: string;
  dose: string;
  route: "oral" | "IM" | "IV" | "rectal" | "sublingual";
  indication: string;
  caveat: string | null;
}

export interface MedicationFlag {
  medication: string;
  concern: string;
  actionRequired: string;
}

// ─── STEP 1: PERITONEAL SIGN SCREEN ──────────────────────────────────────
/**
 * MUST run first. Peritoneal signs = surgical emergency = ambulance.
 * No further evaluation needed before calling 911.
 *
 * The question "does it hurt MORE when I STOP pushing?" (rebound)
 * is more sensitive than asking about pain with pressure.
 * Rigidity + boardlike abdomen = perforation until proven otherwise.
 */
export function assessPeritonealSigns(state: ClinicalState): PeritonealFindings {
  const exam = state.examFindings;
  const s = state.symptoms;

  const rigidity = exam?.abdominalRigidity ?? false;
  const rebound = exam?.reboundTenderness ?? false;
  const guarding = exam?.abdominalGuarding ?? false;
  const boardLike = exam?.boardLikeAbdomen ?? false;

  return {
    rigidity,
    rebound,
    guarding,
    boardLike,
    peritonealSigns: rigidity || rebound || guarding || boardLike,
  };
}

// ─── STEP 2: HIGH-RISK MODIFIER SCREEN ───────────────────────────────────
/**
 * These modifiers lower the ER threshold across ALL quadrants.
 * An elderly patient with mild RLQ pain still needs a lower threshold
 * than a young healthy adult with the same presentation.
 */
export function identifyHighRiskModifiers(state: ClinicalState): HighRiskModifier[] {
  const h = state.history;
  const s = state.symptoms;
  const modifiers: HighRiskModifier[] = [];

  if ((h.age ?? 0) >= 65) {
    modifiers.push({
      name: "Age ≥65",
      clinicalImpact: "AAA, mesenteric ischemia, and diverticulitis all present atypically in elderly. Perforation can occur with minimal symptoms.",
      lowerERThreshold: true,
    });
  }

  if (h.pregnant) {
    modifiers.push({
      name: "Pregnancy",
      clinicalImpact: "Ectopic, abruption, HELLP, preeclampsia, septic abortion, and round ligament pain all require ER evaluation in pregnancy.",
      lowerERThreshold: true,
    });
  }

  if (h.immunocompromised) {
    modifiers.push({
      name: "Immunocompromised",
      clinicalImpact: "Atypical presentations of serious infection. Peritoneal signs may be absent. Lower threshold for imaging and admission.",
      lowerERThreshold: true,
    });
  }

  if (h.priorAbdominalSurgery) {
    modifiers.push({
      name: "Prior abdominal surgery",
      clinicalImpact: "Adhesive small bowel obstruction is common after any abdominal surgery. Also changes appendicitis presentation.",
      lowerERThreshold: true,
    });
  }

  if (h.onSteroids || h.crohnsDisease || h.rheumatoidOnSteroids) {
    modifiers.push({
      name: "Chronic steroid use",
      clinicalImpact: "Steroids mask peritoneal signs and fever. Perforation can be clinically silent. Any abdominal pain in steroid user is high risk.",
      lowerERThreshold: true,
    });
  }

  if (h.aorticAneurysmHistory || (h.age >= 65 && h.smoker && h.male)) {
    modifiers.push({
      name: "AAA risk",
      clinicalImpact: "Abdominal or back pain in a man ≥65 with smoking history — AAA until proven otherwise. Pulsatile mass on exam = ambulance now.",
      lowerERThreshold: true,
    });
  }

  if (h.atrialFibrillation || h.recentMI || h.peripheralVascularDisease) {
    modifiers.push({
      name: "Cardiovascular disease / AFib",
      clinicalImpact: "Mesenteric ischemia risk. AFib is the primary embolic source for acute mesenteric ischemia — severe pain out of proportion to tenderness.",
      lowerERThreshold: true,
    });
  }

  if (h.dialysis || h.endStageRenalDisease) {
    modifiers.push({
      name: "ESRD / dialysis",
      clinicalImpact: "Altered pain perception, fluid shifts, and peritonitis risk (especially in peritoneal dialysis patients).",
      lowerERThreshold: true,
    });
  }

  if (h.cirrhosis || h.liverDisease) {
    modifiers.push({
      name: "Cirrhosis / liver disease",
      clinicalImpact: "Spontaneous bacterial peritonitis (SBP) can present with only mild abdominal discomfort. Always tap ascites if present.",
      lowerERThreshold: true,
    });
  }

  if (h.medications?.some(m =>
    m.toLowerCase().includes("ozempic") ||
    m.toLowerCase().includes("wegovy") ||
    m.toLowerCase().includes("semaglutide") ||
    m.toLowerCase().includes("tirzepatide") ||
    m.toLowerCase().includes("mounjaro") ||
    m.toLowerCase().includes("glp")
  )) {
    modifiers.push({
      name: "GLP-1 receptor agonist",
      clinicalImpact: "Gastroparesis, nausea, pancreatitis, and ileus are associated with GLP-1 medications. Pancreatitis in particular requires lipase.",
      lowerERThreshold: false, // changes differential but doesn't automatically lower ER threshold
    });
  }

  return modifiers;
}

// ─── STEP 3: MEDICATION FLAGS ─────────────────────────────────────────────
/**
 * Dr. Thomas's patient was on Omeprazole, Ozempic, Oxybutynin.
 * Each of these changes the differential meaningfully.
 */
export function flagMedications(state: ClinicalState): MedicationFlag[] {
  const meds = state.history.medications ?? [];
  const flags: MedicationFlag[] = [];

  for (const med of meds) {
    const m = med.toLowerCase();

    if (m.includes("omeprazole") || m.includes("pantoprazole") ||
        m.includes("lansoprazole") || m.includes("ppi")) {
      flags.push({
        medication: med,
        concern: "On PPI — suggests known GERD or peptic ulcer disease history",
        actionRequired: "Ask: still having reflux symptoms? Any prior GI bleed? H. pylori history?",
      });
    }

    if (m.includes("ozempic") || m.includes("wegovy") || m.includes("semaglutide") ||
        m.includes("mounjaro") || m.includes("tirzepatide") || m.includes("glp")) {
      flags.push({
        medication: med,
        concern: "GLP-1 agonist — gastroparesis, pancreatitis, ileus, and nausea are direct drug effects",
        actionRequired: "Add pancreatitis to differential. Consider lipase if epigastric. Ask: is this the usual GLP-1 nausea or different?",
      });
    }

    if (m.includes("oxybutynin") || m.includes("tolterodine") || m.includes("solifenacin") ||
        m.includes("anticholinergic")) {
      flags.push({
        medication: med,
        concern: "Anticholinergic — urinary retention, ileus, and constipation are drug effects",
        actionRequired: "Check for urinary retention (suprapubic fullness, last void time). Constipation-associated pain is possible.",
      });
    }

    if (m.includes("nsaid") || m.includes("ibuprofen") || m.includes("naproxen") ||
        m.includes("aspirin") || m.includes("meloxicam")) {
      flags.push({
        medication: med,
        concern: "NSAID use — peptic ulcer disease and GI bleed risk",
        actionRequired: "Ask about black/tarry stool, hematemesis. NSAID-induced gastritis on differential.",
      });
    }

    if (m.includes("warfarin") || m.includes("xarelto") || m.includes("rivaroxaban") ||
        m.includes("eliquis") || m.includes("apixaban") || m.includes("anticoagulant")) {
      flags.push({
        medication: med,
        concern: "Anticoagulation — spontaneous intramural hematoma and retroperitoneal bleed possible",
        actionRequired: "Any flank ecchymosis (Grey Turner sign)? Check INR if on warfarin.",
      });
    }

    if (m.includes("metformin")) {
      flags.push({
        medication: med,
        concern: "Metformin — GI side effects common, but also screen for lactic acidosis if unwell",
        actionRequired: "If patient looks unwell or has renal failure, hold metformin and check lactate.",
      });
    }

    if (m.includes("prednisone") || m.includes("methylprednisolone") || m.includes("steroid")) {
      flags.push({
        medication: med,
        concern: "Chronic steroid use — masks peritoneal signs and fever. Any abdominal pain is high risk.",
        actionRequired: "Lower ER threshold. Exam findings may be falsely reassuring.",
      });
    }
  }

  return flags;
}

// ─── STEP 4: LOCATION-BASED DIFFERENTIAL ─────────────────────────────────

export function buildAbdominalDifferential(
  state: ClinicalState,
  quadrant: AbdomenQuadrant,
  highRiskModifiers: HighRiskModifier[],
  medFlags: MedicationFlag[]
): AbdominalDxEntry[] {
  const s = state.symptoms;
  const h = state.history;
  const v = state.vitals;
  const exam = state.examFindings;
  const female = h.hasCervix || h.hasUterus || h.genderIdentity === "female";
  const male = h.hasPenis || h.hasTestes || h.genderIdentity === "male";
  const elderly = (h.age ?? 0) >= 65;
  const hasGLP1 = medFlags.some(f => f.medication.toLowerCase().includes("ozempic") ||
    f.medication.toLowerCase().includes("glp"));
  const hasPPIHistory = medFlags.some(f => f.medication.toLowerCase().includes("omeprazole") ||
    f.medication.toLowerCase().includes("ppi"));
  const dx: AbdominalDxEntry[] = [];

  // ── PERITONEAL SIGN DIAGNOSIS ────────────────────────────────────────
  // If peritoneal signs present, surgical emergency tops the differential
  if (exam?.peritonealSigns) {
    dx.push({
      diagnosis: "Hollow viscus perforation (peptic ulcer, appendix, diverticulum)",
      icd10: "K63.1",
      probability: "high",
      urgency: "immediate",
      keyFeature: "Peritoneal signs — ambulance now, surgical emergency",
      requiresCT: true,
      requiresSurgery: true,
    });
  }

  // ── MESENTERIC ISCHEMIA SPECIAL CASE ────────────────────────────────
  // Severe pain + mild tenderness = mesenteric ischemia until proven otherwise
  const severePainMildTenderness = (s.painScore ?? 0) >= 7 &&
    exam?.ttpSeverity === "mild" &&
    (h.atrialFibrillation || h.peripheralVascularDisease || elderly);
  if (severePainMildTenderness) {
    dx.push({
      diagnosis: "Acute mesenteric ischemia",
      icd10: "K55.0",
      probability: "high",
      urgency: "immediate",
      keyFeature: "SEVERE pain OUT OF PROPORTION to mild tenderness — mesenteric ischemia until proven. ER now.",
      requiresCT: true,
      requiresSurgery: true,
    });
  }

  // ── AAA ──────────────────────────────────────────────────────────────
  if (elderly && male && h.smoker && (quadrant === "epigastric" || quadrant === "periumbilical" || quadrant === "diffuse")) {
    dx.push({
      diagnosis: "Abdominal aortic aneurysm (leaking or ruptured)",
      icd10: "I71.4",
      probability: (s.backPain && (s.painScore ?? 0) >= 7) ? "high" : "moderate",
      urgency: "immediate",
      keyFeature: "Older male smoker + abdominal/back pain — AAA until proven. Check for pulsatile mass.",
      requiresCT: true,
      requiresSurgery: true,
    });
  }

  // ── RUQ DIFFERENTIAL ─────────────────────────────────────────────────
  if (quadrant === "RUQ") {
    dx.push({
      diagnosis: "Acute cholecystitis / biliary colic",
      icd10: "K81.0",
      probability: (s.painAfterFattyMeals || s.nauseaWithPain) ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "RUQ + nausea + fatty food trigger + Murphy's sign",
      requiresCT: false, // ultrasound is first line
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Choledocholithiasis / cholangitis",
      icd10: "K80.50",
      probability: (v?.fever && s.jaundice) ? "high" : "low",
      urgency: "immediate",
      keyFeature: "Charcot's triad: RUQ pain + fever + jaundice = cholangitis = ER",
      requiresCT: true,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Hepatitis (viral, alcoholic, toxic)",
      icd10: "K75.9",
      probability: (h.alcoholUse || h.recentSickContact || h.hepatitisRisk) ? "moderate" : "low",
      urgency: "urgent",
      keyFeature: "RUQ + diffuse liver tenderness + jaundice + alcohol/viral exposure",
      requiresCT: false,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Fitz-Hugh-Curtis syndrome",
      icd10: "A74.81",
      probability: (female && h.stdRisk) ? "moderate" : "low",
      urgency: "urgent",
      keyFeature: "RUQ pain in young female with STD risk — perihepatitic inflammation from GC/chlamydia",
      requiresCT: false,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Right lower lobe pneumonia (referred pain)",
      icd10: "J18.1",
      probability: (v?.fever && s.cough) ? "moderate" : "low",
      urgency: "urgent",
      keyFeature: "RUQ pain with fever and cough — get chest X-ray",
      requiresCT: false,
      requiresSurgery: false,
    });
    if (h.priorPE || h.heartFailure) {
      dx.push({
        diagnosis: "Budd-Chiari syndrome / hepatic vein thrombosis",
        icd10: "I82.0",
        probability: "low",
        urgency: "urgent",
        keyFeature: "RUQ + ascites + liver enlargement in patient with hypercoagulable state",
        requiresCT: true,
        requiresSurgery: false,
      });
    }
  }

  // ── LUQ DIFFERENTIAL ─────────────────────────────────────────────────
  if (quadrant === "LUQ") {
    dx.push({
      diagnosis: "Splenic pathology (infarct, rupture, splenomegaly)",
      icd10: "D73.5",
      probability: (h.recentMonoSymptoms || h.atrialFibrillation || h.recentTrauma) ? "moderate" : "low",
      urgency: (h.recentTrauma || h.atrialFibrillation) ? "immediate" : "urgent",
      keyFeature: "LUQ + referred left shoulder pain (Kehr's sign) — splenic pathology. AFib = embolic infarct.",
      requiresCT: true,
      requiresSurgery: h.recentTrauma ?? false,
    });
    dx.push({
      diagnosis: "Pancreatitis",
      icd10: "K85.9",
      probability: (h.alcoholUse || hasGLP1 || h.gallstones || s.radiationToBack) ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "Epigastric/LUQ + radiation to back + nausea + alcohol or GLP-1 use",
      requiresCT: true,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Gastritis / peptic ulcer disease",
      icd10: "K29.70",
      probability: hasPPIHistory ? "moderate" : "low",
      urgency: "semi-urgent",
      keyFeature: "Epigastric/LUQ + burning + worse with empty stomach or NSAIDs",
      requiresCT: false,
      requiresSurgery: false,
    });
    // Cardiac referred pain
    dx.push({
      diagnosis: "Myocardial infarction (inferior / posterior, referred pain)",
      icd10: "I21.19",
      probability: (quadrant === "epigastric" || quadrant === "LUQ") &&
        ((h.age ?? 0) >= 45 || h.diabetes || h.hypertension) ? "moderate" : "low",
      urgency: "immediate",
      keyFeature: "Epigastric/LUQ pain in cardiac risk patient — EKG is mandatory",
      requiresCT: false,
      requiresSurgery: false,
    });
  }

  // ── EPIGASTRIC DIFFERENTIAL ───────────────────────────────────────────
  if (quadrant === "epigastric") {
    dx.push({
      diagnosis: "Gastritis / GERD / peptic ulcer disease",
      icd10: "K29.70",
      probability: hasPPIHistory ? "high" : "moderate",
      urgency: "semi-urgent",
      keyFeature: "Epigastric burning + relief with antacids + PPI use",
      requiresCT: false,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Pancreatitis",
      icd10: "K85.9",
      probability: (h.alcoholUse || hasGLP1 || s.radiationToBack || s.nauseaVomiting) ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "Epigastric + radiation to back + nausea — lipase needed",
      requiresCT: true,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Inferior/posterior MI (referred epigastric pain)",
      icd10: "I21.19",
      probability: ((h.age ?? 0) >= 50 || h.diabetes || h.hypertension || h.smoker) ? "moderate" : "low",
      urgency: "immediate",
      keyFeature: "ALWAYS get EKG for epigastric pain with cardiac risk — MI can present as indigestion",
      requiresCT: false,
      requiresSurgery: false,
    });
    if (hasGLP1) {
      dx.push({
        diagnosis: "GLP-1 induced gastroparesis / ileus",
        icd10: "K31.84",
        probability: "moderate",
        urgency: "semi-urgent",
        keyFeature: "On GLP-1 agonist + nausea + early satiety + bloating",
        requiresCT: false,
        requiresSurgery: false,
      });
    }
  }

  // ── RLQ DIFFERENTIAL ─────────────────────────────────────────────────
  if (quadrant === "RLQ") {
    // Appendicitis — the most important RLQ diagnosis
    const alvaradoScore = computeAlvarado(state);
    dx.push({
      diagnosis: "Acute appendicitis",
      icd10: "K37",
      probability: alvaradoScore >= 7 ? "high" : alvaradoScore >= 5 ? "moderate" : "low",
      urgency: "urgent",
      keyFeature: `RLQ TTP + Alvarado score ${alvaradoScore}/10 — CT or ultrasound needed`,
      requiresCT: true,
      requiresSurgery: alvaradoScore >= 7,
    });
    if (female) {
      dx.push({
        diagnosis: "Ovarian torsion",
        icd10: "N83.51",
        probability: (s.suddenOnset && s.severeColicky) ? "high" : "moderate",
        urgency: "immediate",
        keyFeature: "RLQ in female + sudden severe pain — ovarian torsion is time-sensitive (6h window)",
        requiresCT: false, // ultrasound with doppler
        requiresSurgery: true,
      });
      dx.push({
        diagnosis: "Ovarian cyst / ruptured cyst",
        icd10: "N83.20",
        probability: "moderate",
        urgency: "urgent",
        keyFeature: "RLQ/LLQ in female + cyclic or sudden onset",
        requiresCT: false,
        requiresSurgery: false,
      });
      dx.push({
        diagnosis: "Ectopic pregnancy",
        icd10: "O00.9",
        probability: h.sexuallyActive ? "moderate" : "low",
        urgency: "immediate",
        keyFeature: "RLQ/LLQ in reproductive-age female — HCG is mandatory",
        requiresCT: false,
        requiresSurgery: true,
      });
    }
    dx.push({
      diagnosis: "Nephrolithiasis (right ureter)",
      icd10: "N20.1",
      probability: (s.flankPain || s.radiationToGroin || h.priorKidneyStone) ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "RLQ/flank + colicky + radiation to groin + hematuria on UA",
      requiresCT: true,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Inguinal / incisional hernia",
      icd10: "K40.90",
      probability: (h.priorHerniaRepair || male || s.bulgeWithStraining) ? "moderate" : "low",
      urgency: (s.herniaIrreducible) ? "immediate" : "semi-urgent",
      keyFeature: "Prior hernia repair + RLQ pain + palpable bulge — check for incarceration",
      requiresCT: s.herniaIrreducible ?? false,
      requiresSurgery: s.herniaIrreducible ?? false,
    });
    dx.push({
      diagnosis: "Crohn's disease / ileitis",
      icd10: "K50.90",
      probability: (h.crohnsDisease || h.ibd || s.chronicDiarrhea) ? "high" : "low",
      urgency: "semi-urgent",
      keyFeature: "RLQ + chronic diarrhea + prior IBD history",
      requiresCT: h.crohnsDisease ?? false,
      requiresSurgery: false,
    });
    if (male && (h.age ?? 0) < 35) {
      dx.push({
        diagnosis: "Testicular torsion (referred RLQ)",
        icd10: "N44.00",
        probability: s.testicularPain ? "high" : "low",
        urgency: "immediate",
        keyFeature: "Always examine testicles in young males with RLQ pain — referred pain is common",
        requiresCT: false,
        requiresSurgery: true,
      });
    }
  }

  // ── LLQ DIFFERENTIAL ─────────────────────────────────────────────────
  if (quadrant === "LLQ") {
    dx.push({
      diagnosis: "Diverticulitis",
      icd10: "K57.32",
      probability: ((h.age ?? 0) >= 40 || h.priorDiverticulitis) ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "LLQ + fever + older adult — diverticulitis until proven otherwise",
      requiresCT: true,
      requiresSurgery: false,
    });
    if (female) {
      dx.push({
        diagnosis: "Ovarian torsion (left)",
        icd10: "N83.52",
        probability: s.suddenSeverePain ? "high" : "moderate",
        urgency: "immediate",
        keyFeature: "Sudden severe LLQ in female — ovarian torsion, 6-hour surgical window",
        requiresCT: false,
        requiresSurgery: true,
      });
    }
    dx.push({
      diagnosis: "Sigmoid volvulus",
      icd10: "K56.51",
      probability: (elderly && s.obstipation) ? "moderate" : "low",
      urgency: "urgent",
      keyFeature: "LLQ + distention + obstipation in elderly — volvulus",
      requiresCT: true,
      requiresSurgery: true,
    });
    dx.push({
      diagnosis: "Nephrolithiasis (left ureter)",
      icd10: "N20.1",
      probability: (s.flankPain || h.priorKidneyStone) ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "LLQ/left flank + colicky + radiation to groin + UA blood",
      requiresCT: true,
      requiresSurgery: false,
    });
  }

  // ── SUPRAPUBIC DIFFERENTIAL ───────────────────────────────────────────
  if (quadrant === "suprapubic") {
    dx.push({
      diagnosis: "Cystitis / UTI",
      icd10: "N30.00",
      probability: (s.dysuria || s.frequency) ? "high" : "moderate",
      urgency: "semi-urgent",
      keyFeature: "Suprapubic + dysuria + frequency — UA with leukocytes confirms",
      requiresCT: false,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Urinary retention",
      icd10: "R33.9",
      probability: (h.medications?.some(m =>
        m.toLowerCase().includes("oxybutynin") || m.toLowerCase().includes("anticholinergic")
      )) ? "moderate" : "low",
      urgency: "urgent",
      keyFeature: "Suprapubic fullness + anticholinergic medications + difficulty voiding",
      requiresCT: false,
      requiresSurgery: false,
    });
    if (female) {
      dx.push({
        diagnosis: "Uterine fibroids",
        icd10: "D25.9",
        probability: (female && (h.age ?? 0) >= 30) ? "moderate" : "low",
        urgency: "semi-urgent",
        keyFeature: "Suprapubic fullness + heavy periods + pelvic pressure in women",
        requiresCT: false,
        requiresSurgery: false,
      });
    }
  }

  // ── DIFFUSE / PERIUMBILICAL ───────────────────────────────────────────
  if (quadrant === "diffuse" || quadrant === "periumbilical") {
    dx.push({
      diagnosis: "Small bowel obstruction",
      icd10: "K56.60",
      probability: h.priorAbdominalSurgery ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "Diffuse + colicky + prior surgery + obstipation — obstruction until proven",
      requiresCT: true,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Early appendicitis (periumbilical → migrates to RLQ)",
      icd10: "K37",
      probability: s.migratoryPain ? "high" : "moderate",
      urgency: "urgent",
      keyFeature: "Periumbilical pain migrating to RLQ is classic appendicitis progression",
      requiresCT: true,
      requiresSurgery: false,
    });
    dx.push({
      diagnosis: "Gastroenteritis",
      icd10: "K52.9",
      probability: (s.diarrhea && s.nausea && !s.singleFocalTTP) ? "high" : "moderate",
      urgency: "semi-urgent",
      keyFeature: "Diffuse crampy + diarrhea + nausea — viral most common",
      requiresCT: false,
      requiresSurgery: false,
    });
  }

  // ── PEDIATRIC SPECIAL CASES ───────────────────────────────────────────
  if ((h.age ?? 99) < 12) {
    if (s.intermittentColicky) {
      dx.push({
        diagnosis: "Intussusception",
        icd10: "K56.1",
        probability: (h.age ?? 99) < 3 && s.intermittentColicky && s.lethargyBetweenEpisodes ? "high" : "moderate",
        urgency: "urgent",
        keyFeature: "Episodic severe pain + lethargy between episodes + currant jelly stool in child < 3",
        requiresCT: false, // ultrasound
        requiresSurgery: false,
      });
    }
    if (quadrant === "RLQ" && (h.age ?? 99) < 18) {
      dx.push({
        diagnosis: "Mesenteric lymphadenitis (pediatric)",
        icd10: "I88.0",
        probability: (s.recentURI || v?.fever) ? "moderate" : "low",
        urgency: "semi-urgent",
        keyFeature: "RLQ pain in child after viral illness — lymph node enlargement mimics appendicitis",
        requiresCT: false,
        requiresSurgery: false,
      });
    }
  }

  return dx.sort((a, b) => {
    const urgencyOrder = { immediate: 0, urgent: 1, "semi-urgent": 2, "non-urgent": 3 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}

// ─── ALVARADO SCORE (appendicitis risk) ──────────────────────────────────
export function computeAlvarado(state: ClinicalState): number {
  const s = state.symptoms;
  const v = state.vitals;
  const exam = state.examFindings;
  let score = 0;

  if (s.migratoryPainToRLQ) score += 1;   // Migration
  if (s.anorexia || s.nausea) score += 1;  // Anorexia
  if (s.nauseaVomiting) score += 1;        // Nausea/vomiting
  if (exam?.ttpRLQ) score += 2;            // TTP RLQ (weighted 2)
  if (exam?.reboundRLQ) score += 1;        // Rebound
  if (v?.fever && (v.temp ?? 0) >= 100.4) score += 1; // Fever
  if ((v?.wbc ?? 0) >= 10000) score += 2; // Leukocytosis (weighted 2)

  return score;
}

// ─── STEP 5: WORKUP BUILDER ───────────────────────────────────────────────
export function buildWorkup(
  quadrant: AbdomenQuadrant,
  state: ClinicalState,
  highRiskModifiers: HighRiskModifier[],
  differential: AbdominalDxEntry[],
  medFlags: MedicationFlag[]
): AbdominalWorkup {
  const h = state.history;
  const female = h.hasCervix || h.hasUterus || h.genderIdentity === "female";
  const male = h.hasPenis || h.hasTestes;
  const hasGLP1 = medFlags.some(f => f.medication.toLowerCase().includes("glp") ||
    f.medication.toLowerCase().includes("ozempic"));
  const hasCardiacRisk = (h.age ?? 0) >= 45 || h.diabetes || h.hypertension || h.smoker;

  // UA — always for abdominal pain
  const uaRationale = [
    "Blood → nephrolithiasis or pyelonephritis",
    "Nitrites → UTI/pyelo",
    "Ketones → DKA, starvation, dehydration",
    "Glucose → DKA screen",
    "Leukocytes → cystitis/UTI",
    "Specific gravity ≥1.030 → significant dehydration",
  ].join(" · ");

  // EKG — epigastric or any cardiac risk
  const ekgIndicated = quadrant === "epigastric" || quadrant === "LUQ" || hasCardiacRisk;

  // Labs
  const labs: string[] = [];
  if (differential.some(d => d.diagnosis.includes("pancreatitis") || hasGLP1)) {
    labs.push("Lipase — pancreatitis screen");
  }
  if (differential.some(d => d.diagnosis.includes("hepatitis") || d.diagnosis.includes("gallbladder") || d.diagnosis.includes("Fitz-Hugh"))) {
    labs.push("LFTs — hepatic/biliary evaluation");
  }
  if (highRiskModifiers.some(m => m.name.includes("Cirrhosis"))) {
    labs.push("Bilirubin, albumin, INR — hepatic function");
  }
  if (differential.some(d => d.diagnosis.includes("appendicitis") || d.diagnosis.includes("diverticulitis"))) {
    labs.push("CBC with differential — WBC for infectious/surgical process");
    labs.push("CRP — inflammatory marker (sensitive for appendicitis)");
  }
  if (highRiskModifiers.some(m => m.name.includes("AAA"))) {
    labs.push("Type and screen — AAA concern");
  }

  // Imaging
  const imaging: string[] = [];
  if (differential.some(d => d.requiresCT)) {
    const urgentCT = differential.some(d =>
      d.requiresCT && (d.urgency === "immediate" || d.urgency === "urgent")
    );
    imaging.push(urgentCT
      ? "CT abdomen/pelvis with contrast — urgent (ER)"
      : "CT abdomen/pelvis with contrast — outpatient"
    );
  }
  if (quadrant === "RUQ") {
    imaging.push("RUQ ultrasound — first line for biliary evaluation");
  }
  if (female && (quadrant === "RLQ" || quadrant === "LLQ" || quadrant === "suprapubic")) {
    imaging.push("Pelvic ultrasound with doppler — ovarian torsion, cyst, fibroid");
  }
  if (differential.some(d => d.diagnosis.includes("pneumonia"))) {
    imaging.push("Chest X-ray — right lower lobe PNA referred RUQ pain");
  }

  // Exam components required
  const examRequired = ["Auscultation — bowel sounds", "Percussion — tympany vs dullness", "Palpation — TTP, guarding, rebound"];
  if (male && (h.age ?? 99) < 40) examRequired.push("Scrotal exam — testicular torsion must be excluded in young males");
  if (h.age >= 65) examRequired.push("Palpate for pulsatile mass — AAA screen");
  if (h.cirrhosis || h.liverDisease) examRequired.push("Assess for ascites — shifting dullness, fluid wave");
  examRequired.push("Skin exam — look for Zoster vesicles, jaundice, Grey Turner sign, Cullen sign");

  // Do NOT order
  const doNotOrder = [
    "Abdominal X-ray as primary imaging (low yield — CT almost always preferred if imaging needed)",
  ];
  if (s.symptomPattern === "constipation" && (state.symptoms.painScore ?? 0) <= 4) {
    doNotOrder.push("No labs or imaging for clear constipation story with mild pain");
  }

  return {
    ua: true,
    uaRationale,
    hcg: female || h.pregnant !== false,
    ekg: ekgIndicated,
    ekgRationale: ekgIndicated
      ? "Inferior MI presents as epigastric pain — EKG is mandatory for epigastric pain with any cardiac risk"
      : null,
    labs,
    imaging,
    examRequired,
    doNotOrder,
  };

  // TypeScript needs explicit return type satisfying interface
  function s() { return state.symptoms; }
}

// ─── STEP 6: IMAGING DECISION ─────────────────────────────────────────────
export function decideImaging(
  state: ClinicalState,
  differential: AbdominalDxEntry[],
  highRiskModifiers: HighRiskModifier[]
): ImagingDecision {
  const s = state.symptoms;
  const painScore = s.painScore ?? 0;
  const constant = s.constant ?? false;
  const ttp = state.examFindings?.ttpPresent ?? false;
  const hasHighRisk = highRiskModifiers.some(m => m.lowerERThreshold);
  const ctRequired = differential.some(d => d.requiresCT);

  if (!ctRequired) {
    return {
      ctIndicated: false,
      ctUrgency: "none",
      ctType: null,
      imagingRationale: "Clinical picture does not require cross-sectional imaging at this time",
      xrayIndicated: false,
    };
  }

  // Dr. Thomas's framework: severe + constant + TTP = CT in ER
  // Mild + intermittent = outpatient CT
  const erStat = (painScore >= 7 && constant && ttp) || hasHighRisk;
  const outpatientToday = !erStat && painScore >= 5;

  return {
    ctIndicated: true,
    ctUrgency: erStat ? "er_stat" : outpatientToday ? "outpatient_today" : "outpatient_routine",
    ctType: "CT abdomen and pelvis with IV contrast",
    imagingRationale: erStat
      ? `Severe pain (${painScore}/10) + constant + tenderness — any one of these alone warrants same-day imaging. All three present = ER for stat CT.`
      : `Pain present and workup needed, but severity allows outpatient CT today.`,
    xrayIndicated: false,
  };
}

// ─── STEP 7: TREATMENT PLAN ───────────────────────────────────────────────
export function buildAbdominalTreatment(
  state: ClinicalState,
  disposition: AbdomenDisposition
): AbdominalTreatmentPlan {
  const npoRecommended = disposition === "ambulance_now" || disposition === "er_now";

  return {
    nauseaMedications: [
      {
        name: "Ondansetron (Zofran)",
        dose: "4-8mg IM or oral dissolving tablet",
        route: "IM",
        indication: "Nausea — first line, non-sedating",
        caveat: "Oral dissolving tablet if mild nausea and can cooperate",
      },
      {
        name: "Prochlorperazine (Compazine)",
        dose: "10mg IM",
        route: "IM",
        indication: "Severe nausea/vomiting — also has pain-modulating properties",
        caveat: "Pre-treat with diphenhydramine 25mg IM to prevent akathisia",
      },
    ],
    painMedications: [
      {
        name: "Ketorolac (Toradol)",
        dose: "30mg IM (15mg if elderly or weight <50kg)",
        route: "IM",
        indication: "Moderate-severe abdominal pain — safe to give, does not mask surgical abdomen",
        caveat: "Avoid if peptic ulcer, renal insufficiency, or anticoagulation. Myth: giving analgesia does NOT mask surgical findings — give pain relief.",
      },
      {
        name: "Acetaminophen",
        dose: "1000mg oral or IV",
        route: "oral",
        indication: "Pain — safe in pregnancy, renal disease, after NSAIDs contraindicated",
        caveat: "Reduce dose in liver disease",
      },
    ],
    antispasmodics: [
      {
        name: "Dicyclomine (Bentyl)",
        dose: "20mg oral",
        route: "oral",
        indication: "Crampy abdominal pain / IBS pattern",
        caveat: "Avoid in glaucoma, urinary retention, severe ulcerative colitis",
      },
    ],
    ivFluidCandidate: state.vitals?.specificGravity >= 1.03 ||
      !state.symptoms.canKeepFluidDown,
    npoRecommended,
    dietAdvice: npoRecommended
      ? ["Nothing by mouth until surgical evaluation complete"]
      : ["Clear liquids only until pain resolves", "Advance diet slowly as tolerated"],
    antibiotics: [], // only added if specific infectious diagnosis confirmed
  };
}

// ─── STEP 8: DISPOSITION DECIDER ─────────────────────────────────────────
export function decideAbdominalDisposition(
  peritoneal: PeritonealFindings,
  highRiskModifiers: HighRiskModifier[],
  imaging: ImagingDecision,
  differential: AbdominalDxEntry[],
  state: ClinicalState
): { disposition: AbdomenDisposition; rationale: string[]; ambulanceRequired: boolean } {
  const rationale: string[] = [];

  // Ambulance — peritoneal signs or vascular emergency
  if (peritoneal.peritonealSigns) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: ["Peritoneal signs present — surgical emergency. Calling ambulance."],
    };
  }
  if (differential.some(d => d.diagnosis.includes("AAA") && d.probability === "high")) {
    return {
      disposition: "ambulance_now",
      ambulanceRequired: true,
      rationale: ["AAA rupture concern — ambulance now."],
    };
  }

  // ER now — severe + constant + TTP, or immediate-urgency diagnosis
  if (imaging.ctUrgency === "er_stat") {
    rationale.push("Severity, constancy, and tenderness together require same-day CT in the ER");
  }
  const immediateNeeded = differential.some(d => d.urgency === "immediate");
  if (immediateNeeded) {
    rationale.push(...differential
      .filter(d => d.urgency === "immediate")
      .map(d => `${d.diagnosis}: ${d.keyFeature}`)
    );
  }
  if (highRiskModifiers.some(m => m.lowerERThreshold) && (state.symptoms.painScore ?? 0) >= 5) {
    rationale.push(...highRiskModifiers
      .filter(m => m.lowerERThreshold)
      .map(m => `High-risk modifier: ${m.name} — ${m.clinicalImpact}`)
    );
  }

  if (imaging.ctUrgency === "er_stat" || immediateNeeded ||
      (highRiskModifiers.some(m => m.lowerERThreshold) && (state.symptoms.painScore ?? 0) >= 5)) {
    return { disposition: "er_now", ambulanceRequired: false, rationale };
  }

  // Outpatient CT
  if (imaging.ctUrgency === "outpatient_today" || imaging.ctUrgency === "outpatient_routine") {
    rationale.push("Pain level allows outpatient imaging — CT ordered today");
    return { disposition: "ct_outpatient", ambulanceRequired: false, rationale };
  }

  // Treat and watch
  rationale.push("Clinical picture consistent with benign etiology — treat symptoms, return precautions given");
  return { disposition: "treat_and_watch", ambulanceRequired: false, rationale };
}

// ─── PATIENT EXPLANATION ─────────────────────────────────────────────────
export function buildAbdominalExplanation(
  disposition: AbdomenDisposition,
  rationale: string[],
  differential: AbdominalDxEntry[]
): string {
  if (disposition === "ambulance_now") {
    return "What I'm finding on your exam is very concerning — your abdomen is rigid and that tells me something serious is happening inside. We need to call 911 right now. Do not drive yourself.";
  }
  if (disposition === "er_now") {
    const topDx = differential[0];
    return `The concerning part is ${rationale[0]?.toLowerCase() ?? "the combination of your symptoms"}. ${topDx ? `I'm most concerned about ${topDx.diagnosis.toLowerCase()}.` : ""} You need a CT scan today and that has to be done in the ER. I'll write you a note. Do you need something for nausea or pain before you go?`;
  }
  if (disposition === "ct_outpatient") {
    return "Your pain level allows us to get a CT scan as an outpatient today rather than going through the ER. I'm ordering it now — you'll get a call with the appointment. If anything gets worse before then, go straight to the ER.";
  }
  return "Based on what I'm seeing, this looks manageable without urgent imaging. I'll treat your symptoms and give you specific instructions on when to come back or go to the ER.";
}

// ─── MASTER SYNTHESIZER ──────────────────────────────────────────────────
export function assessAbdominalPain(state: ClinicalState): AbdominalAssessment {
  const quadrant = (state.symptoms.painLocation as AbdomenQuadrant) ?? "unknown";
  const peritoneal = assessPeritonealSigns(state);
  const highRiskModifiers = identifyHighRiskModifiers(state);
  const medFlags = flagMedications(state);
  const differential = buildAbdominalDifferential(state, quadrant, highRiskModifiers, medFlags);
  const workup = buildWorkup(quadrant, state, highRiskModifiers, differential, medFlags);
  const imaging = decideImaging(state, differential, highRiskModifiers);
  const { disposition, rationale, ambulanceRequired } =
    decideAbdominalDisposition(peritoneal, highRiskModifiers, imaging, differential, state);
  const treatmentPlan = buildAbdominalTreatment(state, disposition);

  const returnPrecautions = [
    "Return immediately or call 911 if: rigid or boardlike abdomen, severe worsening pain, fainting, vomiting blood, blood in stool",
    "Return to urgent care or ER if: pain significantly worsens, fever develops, unable to keep fluids down, no improvement in 24 hours",
  ];
  if (highRiskModifiers.some(m => m.name.includes("65"))) {
    returnPrecautions.push("Age-specific: elderly patients can deteriorate quickly — lower threshold to return if any change");
  }

  return {
    disposition,
    ambulanceRequired,
    peritonealSigns: peritoneal,
    highRiskModifiers,
    quadrant,
    differential,
    workup,
    treatmentPlan,
    imagingDecision: imaging,
    dispositionRationale: rationale,
    patientExplanation: buildAbdominalExplanation(disposition, rationale, differential),
    returnPrecautions,
    medicationFlags: medFlags,
  };
}

/**
 * WORKED EXAMPLE — Dr. Thomas's patient:
 *
 * Extracted state:
 *   painLocation: "RLQ" (tender near right lower abdomen)
 *   painScore: 8, constant: true
 *   quality: "sharp"
 *   nausea: true, diarrhea: true (5x/day liquid)
 *   canKeepFluidDown: true (drinking water)
 *   backPain: false, testicularPain: false, dysuria: false
 *   priorKidneyStone: true, priorHerniaRepair: true
 *   familyHxColonCancer: true (mother age 40)
 *   colonoscopyUpToDate: true
 *   medications: ["Omeprazole", "Ozempic", "Oxybutynin"]
 *   examFindings: { ttpRLQ: true, ttpSeverity: "moderate", peritonealSigns: false }
 *   age: [not stated, assume adult]
 *   genderIdentity: [not stated in this transcript]
 *
 * Assessment:
 *   Peritoneal signs: NONE → not ambulance
 *   High-risk modifiers: GLP-1 (Ozempic → gastroparesis/pancreatitis differential)
 *                        Oxybutynin (anticholinergic → retention/ileus)
 *   Quadrant: RLQ
 *   Top differential: Appendicitis (constant + RLQ TTP + severe)
 *                     Nephrolithiasis (prior stone history)
 *                     Hernia (prior repair)
 *                     GLP-1 ileus/gastroparesis
 *
 *   Imaging: CT urgency = ER STAT
 *     (pain 8/10 + constant + RLQ TTP = all 3 Dr. Thomas criteria)
 *
 *   Disposition: ER NOW
 *
 *   Workup: UA (check for blood → stone), HCG if female, EKG not indicated
 *           (not epigastric), lipase (Ozempic → pancreatitis screen),
 *           CBC + CRP (appendicitis), NO abdominal X-ray
 *
 *   Medication flags:
 *     Ozempic → add pancreatitis to differential, check lipase
 *     Oxybutynin → check for urinary retention, ileus component
 *     Omeprazole → prior GERD/PUD history
 *
 *   Treatment in office: Zofran 8mg IM + Toradol 30mg IM
 *   (pain relief does NOT mask surgical abdomen — give it)
 *
 *   Patient explanation: "The concerning part is the severity, it is
 *   constant, and you have tenderness. Any one of these should be checked
 *   out right away. I'm most concerned about appendicitis. You need a CT
 *   scan today and that has to be done in the ER. Do you need something
 *   for nausea or pain before you go?"
 */
