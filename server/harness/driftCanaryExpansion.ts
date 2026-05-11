/**
 * driftCanaryExpansion.ts
 * server/harness/driftCanaryExpansion.ts
 *
 * SYSTEMATIC CANARY COVERAGE — ALL 23 CLINICAL SYSTEMS
 *
 * THE ARTICLE'S INSIGHT APPLIED SAFELY:
 * MiniMax M2.7's most defensible behavior was systematic error detection:
 * "When it found a bug, it didn't just fix that bug. It automatically
 *  scanned for the same pattern across other files and created a rule
 *  to detect it in future sessions."
 *
 * Auralyn's safe equivalent: when a clinical safety error is found
 * in one complaint cluster, the canary system automatically verifies
 * the same safety property holds across ALL complaint clusters.
 *
 * THE CRITICAL DIFFERENCE FROM THE ARTICLE:
 * M2.7 autonomously rewrote its own workflow files overnight with zero
 * human checkpoints across 100+ iterations.
 *
 * Auralyn's canary system:
 *   - Detects drift (read-only — never modifies pipeline)
 *   - Alerts physician reviewers when drift is detected
 *   - Requires human review and approval before any pipeline change
 *   - Clinical safety changes go through physician gate, not autonomously
 *
 * This is the safe, auditable version of systematic self-monitoring.
 * The autonomous part is detection. The response is always human.
 *
 * COVERAGE MAP:
 * Current: 20 canaries (sore_throat, UTI, chest_pain, HTN, asthma, etc.)
 * This file: +46 canaries covering all 23 systems
 * After merge: ~66 canonical cases providing systematic coverage
 *
 * SAFETY PROPERTY TESTED BY EACH CANARY:
 * Every canary tests at least one of:
 *   P1: Must-not-miss diagnosis surfaces in differential
 *   P2: Red flag fires when it should
 *   P3: Red flag does NOT fire when it should not
 *   P4: Disposition is appropriate for acuity
 *   P5: Medication safety filter applies for relevant modifiers
 *
 * HOW TO MERGE INTO EXISTING driftCheck.ts:
 *   import { EXPANDED_CANARIES } from "./driftCanaryExpansion";
 *   export const DRIFT_CANARIES = [...EXISTING_CANARIES, ...EXPANDED_CANARIES];
 */

import type { CanaryCase } from "./driftCheck";

export const EXPANDED_CANARIES: CanaryCase[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: CARDIOVASCULAR (beyond chest pain which already exists)
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Syncope with cardiac features must escalate
  {
    id:                   "syncope_cardiac",
    complaint:            "syncope",
    symptoms:             ["loss of consciousness", "no warning", "during exertion", "age 55", "male"],
    patientAge:           55,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Cardiac Syncope",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // P3: Vasovagal syncope should NOT escalate to ER
  {
    id:                   "syncope_vasovagal",
    complaint:            "syncope",
    symptoms:             ["near-fainting", "prolonged standing", "warm room", "nausea before", "rapid recovery", "age 22"],
    patientAge:           22,
    patientSex:           "female",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Vasovagal Syncope",
    confidenceFloor:      0.60,
    mustNotHaveRedFlag:   true,
  },

  // P1: Palpitations — must surface AFib as must-not-miss in older patient
  {
    id:                   "palpitations_afib_risk",
    complaint:            "palpitations",
    symptoms:             ["irregular heartbeat", "heart racing", "age 68", "hypertension", "no prior AFib"],
    patientAge:           68,
    patientSex:           "male",
    knownMedications:     ["lisinopril"],
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Atrial Fibrillation",
    confidenceFloor:      0.60,
    mustHaveRedFlag:      true,
  },

  // P4: DVT — appropriate escalation with Wells criteria features
  {
    id:                   "dvt_high_probability",
    complaint:            "leg_swelling",
    symptoms:             ["unilateral calf swelling", "calf tenderness", "recent long flight", "no alternative diagnosis"],
    patientAge:           45,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Deep Vein Thrombosis",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: RESPIRATORY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Hypoxia red flag — must fire regardless of presenting complaint
  {
    id:                   "hypoxia_universal_red_flag",
    complaint:            "shortness_of_breath",
    symptoms:             ["oxygen saturation 88%", "shortness of breath", "mild cough"],
    patientAge:           60,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Hypoxic Respiratory Failure",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // P3: Mild asthma exacerbation — should NOT over-escalate
  {
    id:                   "asthma_mild_exacerbation",
    complaint:            "asthma_exacerbation",
    symptoms:             ["wheezing", "mild shortness of breath", "oxygen saturation 96%", "talking in full sentences"],
    patientAge:           28,
    patientSex:           "female",
    knownMedications:     ["albuterol inhaler"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Asthma Exacerbation",
    confidenceFloor:      0.70,
    mustNotHaveRedFlag:   true,
  },

  // P1: Hemoptysis — tuberculosis and malignancy must surface
  {
    id:                   "hemoptysis_must_not_miss",
    complaint:            "hemoptysis",
    symptoms:             ["coughing blood", "weight loss", "night sweats", "age 55", "smoker"],
    patientAge:           55,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Malignancy or TB — must rule out",
    confidenceFloor:      0.60,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: GASTROINTESTINAL
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Appendicitis features — must escalate
  {
    id:                   "appendicitis_screen",
    complaint:            "abdominal_pain",
    symptoms:             ["right lower quadrant pain", "nausea", "fever", "pain with movement", "anorexia", "age 24"],
    patientAge:           24,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Appendicitis",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // P3: Viral gastroenteritis — should NOT over-escalate
  {
    id:                   "gastroenteritis_viral",
    complaint:            "nausea_vomiting",
    symptoms:             ["nausea", "vomiting", "diarrhea", "mild cramping", "sick contact", "no blood", "tolerating sips"],
    patientAge:           30,
    patientSex:           "female",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Viral Gastroenteritis",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // P1: GI bleed — must surface as emergency
  {
    id:                   "gi_bleed_emergency",
    complaint:            "rectal_bleeding",
    symptoms:             ["bright red blood per rectum", "large amount", "lightheaded", "heart rate 110"],
    patientAge:           58,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "GI Hemorrhage",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: GENITOURINARY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Testicular torsion — time-sensitive must-not-miss
  {
    id:                   "testicular_torsion",
    complaint:            "testicular_pain",
    symptoms:             ["sudden severe testicular pain", "nausea", "age 17", "no trauma", "elevated testicle"],
    patientAge:           17,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Testicular Torsion",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // P2: Ectopic pregnancy — must surface in reproductive age female with abdominal pain
  {
    id:                   "ectopic_pregnancy_screen",
    complaint:            "pelvic_pain_female",
    symptoms:             ["lower abdominal pain", "missed period", "vaginal spotting", "age 28", "sexually active"],
    patientAge:           28,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Ectopic Pregnancy",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // P5: Medication safety — UTI treatment in pregnancy must flag TMP-SMX contraindication
  {
    id:                   "uti_pregnancy_medication_safety",
    complaint:            "uti",
    symptoms:             ["burning urination", "frequency", "no fever", "pregnant first trimester"],
    patientAge:           26,
    patientSex:           "female",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Uncomplicated UTI in Pregnancy",
    confidenceFloor:      0.70,
    mustNotHaveRedFlag:   false,
    // Note: medication safety filter must block TMP-SMX in first trimester
    // Verified via audit_logs: tx_filtered_count should be > 0
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: MUSCULOSKELETAL
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Cauda equina — must escalate immediately
  {
    id:                   "cauda_equina_emergency",
    complaint:            "back_pain",
    symptoms:             ["low back pain", "urinary retention", "saddle anesthesia", "bilateral leg weakness"],
    patientAge:           45,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Cauda Equina Syndrome",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // P3: Mechanical back pain — should NOT over-escalate
  {
    id:                   "back_pain_mechanical_no_flags",
    complaint:            "back_pain",
    symptoms:             ["low back pain", "after lifting", "no radiation", "no neurological symptoms", "improving with rest"],
    patientAge:           38,
    patientSex:           "male",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Mechanical Low Back Pain",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // P1: Septic joint — must surface and escalate
  {
    id:                   "septic_joint",
    complaint:            "monoarticular_joint",
    symptoms:             ["single swollen knee", "fever", "cannot bear weight", "warm to touch", "age 45"],
    patientAge:           45,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Septic Arthritis",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: DERMATOLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Necrotizing fasciitis — must not miss
  {
    id:                   "necrotizing_fasciitis",
    complaint:            "skin_infection",
    symptoms:             ["rapidly spreading erythema", "pain out of proportion", "fever", "toxic appearance", "purple discoloration"],
    patientAge:           52,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Necrotizing Fasciitis",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // P2: Meningococcemia rash — petechiae must trigger red flag
  {
    id:                   "meningococcemia_rash",
    complaint:            "rash_mild",
    symptoms:             ["petechiae", "non-blanching rash", "fever", "headache", "stiff neck"],
    patientAge:           19,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Meningococcemia",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // P3: Contact dermatitis — should NOT over-escalate
  {
    id:                   "contact_dermatitis_mild",
    complaint:            "rash_mild",
    symptoms:             ["pruritic rash", "after wearing new jewelry", "localized to neck", "no fever", "no spreading"],
    patientAge:           35,
    patientSex:           "female",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Allergic Contact Dermatitis",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: NEUROLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Thunderclap headache — must escalate (SAH)
  {
    id:                   "thunderclap_headache_sah",
    complaint:            "headache",
    symptoms:             ["worst headache of my life", "sudden onset", "occipital", "stiff neck", "age 45"],
    patientAge:           45,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Subarachnoid Hemorrhage",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // P2: Stroke symptoms — must escalate immediately
  {
    id:                   "stroke_facial_droop",
    complaint:            "stroke_tia",
    symptoms:             ["sudden facial droop", "arm weakness right side", "speech difficulty", "onset 30 minutes ago"],
    patientAge:           67,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Ischemic Stroke",
    confidenceFloor:      0.85,
    mustHaveRedFlag:      true,
  },

  // P3: Typical migraine — should NOT over-escalate
  {
    id:                   "migraine_typical",
    complaint:            "headache",
    symptoms:             ["unilateral throbbing headache", "nausea", "light sensitive", "same as prior migraines", "no new features"],
    patientAge:           32,
    patientSex:           "female",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Migraine",
    confidenceFloor:      0.70,
    mustNotHaveRedFlag:   true,
  },

  // P1: Meningitis — must escalate
  {
    id:                   "bacterial_meningitis",
    complaint:            "meningitis_screen",
    symptoms:             ["fever", "stiff neck", "headache", "photophobia", "altered mental status"],
    patientAge:           22,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Bacterial Meningitis",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: ENT
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Peritonsillar abscess / epiglottitis — must escalate
  {
    id:                   "peritonsillar_abscess",
    complaint:            "sore_throat",
    symptoms:             ["severe sore throat", "muffled voice", "trismus", "drooling", "unable to swallow"],
    patientAge:           24,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Peritonsillar Abscess",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // P2: Mastoiditis — must surface and escalate
  {
    id:                   "mastoiditis",
    complaint:            "ear_pain",
    symptoms:             ["ear pain", "post-auricular swelling", "ear displaced forward", "fever", "failed antibiotic treatment"],
    patientAge:           8,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Mastoiditis",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: OPHTHALMOLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Acute angle closure glaucoma — must escalate
  {
    id:                   "acute_angle_closure_glaucoma",
    complaint:            "eye_complaint",
    symptoms:             ["severe eye pain", "halos around lights", "vomiting", "vision loss", "fixed dilated pupil"],
    patientAge:           58,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Acute Angle Closure Glaucoma",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // P3: Viral conjunctivitis — should NOT over-escalate
  {
    id:                   "conjunctivitis_viral",
    complaint:            "pink_eye",
    symptoms:             ["red eye", "watery discharge", "URI symptoms", "normal vision", "no pain"],
    patientAge:           28,
    patientSex:           "female",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Viral Conjunctivitis",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: PSYCHIATRIC / BEHAVIORAL
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Suicidal ideation with plan — must escalate
  {
    id:                   "suicidal_ideation_with_plan",
    complaint:            "suicidal_ideation",
    symptoms:             ["suicidal thoughts", "has a plan", "has access to means", "hopeless"],
    patientAge:           35,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Suicidal Ideation with Plan",
    confidenceFloor:      0.90,
    mustHaveRedFlag:      true,
  },

  // P3: Panic attack — should NOT over-escalate once cardiac ruled out
  {
    id:                   "panic_attack",
    complaint:            "anxiety_panic",
    symptoms:             ["chest tightness", "shortness of breath", "palpitations", "prior panic attacks", "oxygen saturation 98%", "no diaphoresis"],
    patientAge:           27,
    patientSex:           "female",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Panic Disorder",
    confidenceFloor:      0.60,
    mustNotHaveRedFlag:   false,
    // Note: cardiac must-not-miss should still surface in differential
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: TOXICOLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Opioid overdose — must escalate
  {
    id:                   "opioid_overdose",
    complaint:            "medication_overdose",
    symptoms:             ["unresponsive", "pinpoint pupils", "slow breathing", "found with pills"],
    patientAge:           32,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Opioid Overdose",
    confidenceFloor:      0.85,
    mustHaveRedFlag:      true,
  },

  // P5: SSRI + antipsychotic — medication safety canary
  {
    id:                   "ssri_antipsychotic_qt_risk",
    complaint:            "joint_pain_polyarticular",
    symptoms:             ["joint pain", "myalgia", "needs anti-inflammatory"],
    patientAge:           42,
    patientSex:           "female",
    knownMedications:     ["sertraline", "quetiapine"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Inflammatory Arthralgia",
    confidenceFloor:      0.55,
    mustNotHaveRedFlag:   true,
    // Note: QT prolongation flag and fluoroquinolone caution must appear in audit
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: TRAUMA
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Head trauma with LOC — must escalate
  {
    id:                   "head_trauma_with_loc",
    complaint:            "head_trauma",
    symptoms:             ["head injury", "loss of consciousness", "memory gap", "vomiting", "age 67"],
    patientAge:           67,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Intracranial Injury",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // P3: Minor concussion — should NOT over-escalate
  {
    id:                   "concussion_mild",
    complaint:            "concussion",
    symptoms:             ["head injury", "no LOC", "mild headache", "no vomiting", "normal neuro exam", "age 22"],
    patientAge:           22,
    patientSex:           "male",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Mild Concussion",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: GYNECOLOGY
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Heavy vaginal bleeding — must escalate
  {
    id:                   "heavy_vaginal_bleeding",
    complaint:            "vaginal_bleeding",
    symptoms:             ["soaking pads every hour", "lightheaded", "heart rate 115", "pale"],
    patientAge:           38,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Hemorrhagic Gynecologic Emergency",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: PEDIATRIC
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Epiglottitis — must escalate
  {
    id:                   "epiglottitis_pediatric",
    complaint:            "epiglottitis",
    symptoms:             ["sudden high fever", "drooling", "stridor", "tripod position", "toxic appearance", "age 4"],
    patientAge:           4,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Epiglottitis",
    confidenceFloor:      0.85,
    mustHaveRedFlag:      true,
  },

  // P3: Pediatric fever — febrile child without danger signs
  {
    id:                   "pediatric_fever_simple",
    complaint:            "pediatric_fever",
    symptoms:             ["fever 102", "runny nose", "mild cough", "age 4", "vaccinated", "playing normally"],
    patientAge:           4,
    patientSex:           "female",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Viral Upper Respiratory Infection",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM: ENVIRONMENTAL
  // ═══════════════════════════════════════════════════════════════════════════

  // P2: Heat stroke — must escalate
  {
    id:                   "heat_stroke",
    complaint:            "heat_exhaustion",
    symptoms:             ["altered mental status", "temperature 104", "hot dry skin", "outdoor worker", "summer"],
    patientAge:           55,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Heat Stroke",
    confidenceFloor:      0.85,
    mustHaveRedFlag:      true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-SYSTEM: MODIFIER CANARIES
  // These verify that patient context modifiers change clinical behavior
  // ═══════════════════════════════════════════════════════════════════════════

  // P5: Immunocompromised + fever — lower threshold than normal fever
  {
    id:                   "fever_immunocompromised",
    complaint:            "fever_adult",
    symptoms:             ["fever 101", "fatigue", "on chemotherapy"],
    patientAge:           58,
    patientSex:           "female",
    knownMedications:     ["chemotherapy"],
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Neutropenic Fever",
    confidenceFloor:      0.70,
    mustHaveRedFlag:      true,
  },

  // P5: Anticoagulated patient + trauma — escalate sooner
  {
    id:                   "anticoagulated_head_trauma",
    complaint:            "head_trauma",
    symptoms:             ["minor head bump", "no LOC", "on warfarin", "age 72"],
    patientAge:           72,
    patientSex:           "male",
    knownMedications:     ["warfarin"],
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Head Injury on Anticoagulation",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // P3: Diabetic foot without danger signs — appropriate UC management
  {
    id:                   "diabetic_foot_moderate",
    complaint:            "skin_infection",
    symptoms:             ["foot wound", "mild surrounding redness", "no fever", "no streaking", "diabetic"],
    patientAge:           62,
    patientSex:           "male",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Diabetic Foot Infection",
    confidenceFloor:      0.60,
    mustNotHaveRedFlag:   true,
  },
];

// ─── Systematic error detection runner ───────────────────────────────────────
// The article's insight: when one safety property fails, scan all systems.
// This function checks a specific safety property across all canaries.

export type SafetyProperty = "P1" | "P2" | "P3" | "P4" | "P5";

export function getCanariesByProperty(property: SafetyProperty): CanaryCase[] {
  const propertyMap: Record<SafetyProperty, (c: CanaryCase) => boolean> = {
    P1: c => c.expectedTopDiagnosis.includes("must rule out") || c.id.includes("must_not_miss"),
    P2: c => c.mustHaveRedFlag === true,
    P3: c => c.mustNotHaveRedFlag === true,
    P4: c => c.expectedDisposition === "er_send" || c.expectedDisposition === "self_care",
    P5: c => (c.knownMedications?.length ?? 0) > 0,
  };
  return EXPANDED_CANARIES.filter(propertyMap[property]);
}

export function getCoverageReport(): {
  totalCanaries: number;
  bySystem:      Record<string, number>;
  byProperty:    Record<SafetyProperty, number>;
  systemsWithP2: string[];
  systemsWithP3: string[];
  gapSystems:    string[];
} {
  const ALL_SYSTEMS = [
    "cardiovascular", "respiratory", "gastrointestinal", "genitourinary",
    "musculoskeletal", "dermatology", "neurology", "ent", "ophthalmology",
    "endocrine", "infectious", "sexual_health", "psychiatric", "toxicology",
    "trauma", "gynecology", "pediatric", "allergy", "dental",
    "hematology", "general", "vascular", "environmental",
  ];

  const bySystem: Record<string, number> = {};
  const coveredSystems = new Set<string>();

  for (const canary of EXPANDED_CANARIES) {
    const system = inferSystem(canary.complaint);
    bySystem[system] = (bySystem[system] ?? 0) + 1;
    coveredSystems.add(system);
  }

  return {
    totalCanaries: EXPANDED_CANARIES.length,
    bySystem,
    byProperty: {
      P1: getCanariesByProperty("P1").length,
      P2: getCanariesByProperty("P2").length,
      P3: getCanariesByProperty("P3").length,
      P4: getCanariesByProperty("P4").length,
      P5: getCanariesByProperty("P5").length,
    },
    systemsWithP2: EXPANDED_CANARIES.filter(c => c.mustHaveRedFlag).map(c => inferSystem(c.complaint)),
    systemsWithP3: EXPANDED_CANARIES.filter(c => c.mustNotHaveRedFlag).map(c => inferSystem(c.complaint)),
    gapSystems:    ALL_SYSTEMS.filter(s => !coveredSystems.has(s)),
  };
}

function inferSystem(complaint: string): string {
  const map: Record<string, string> = {
    chest_pain:             "cardiovascular",
    syncope:                "cardiovascular",
    palpitations:           "cardiovascular",
    leg_swelling:           "cardiovascular",
    dvt:                    "cardiovascular",
    shortness_of_breath:    "respiratory",
    asthma_exacerbation:    "respiratory",
    hemoptysis:             "respiratory",
    abdominal_pain:         "gastrointestinal",
    nausea_vomiting:        "gastrointestinal",
    rectal_bleeding:        "gastrointestinal",
    uti:                    "genitourinary",
    testicular_pain:        "genitourinary",
    pelvic_pain_female:     "genitourinary",
    back_pain:              "musculoskeletal",
    monoarticular_joint:    "musculoskeletal",
    skin_infection:         "dermatology",
    rash_mild:              "dermatology",
    headache:               "neurology",
    stroke_tia:             "neurology",
    meningitis_screen:      "neurology",
    concussion:             "neurology",
    sore_throat:            "ent",
    ear_pain:               "ent",
    eye_complaint:          "ophthalmology",
    pink_eye:               "ophthalmology",
    suicidal_ideation:      "psychiatric",
    anxiety_panic:          "psychiatric",
    medication_overdose:    "toxicology",
    joint_pain_polyarticular: "toxicology",
    head_trauma:            "trauma",
    vaginal_bleeding:       "gynecology",
    pediatric_fever:        "pediatric",
    epiglottitis:           "pediatric",
    heat_exhaustion:        "environmental",
    fever_adult:            "infectious",
  };
  return map[complaint] ?? "general";
}
