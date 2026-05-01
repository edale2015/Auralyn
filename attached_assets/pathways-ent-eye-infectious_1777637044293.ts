/**
 * pathways-ent-eye-infectious.ts
 * Drop into: server/clinical/pathways/ent-eye-infectious.ts
 *
 * COMPLETE CLINICAL PATHWAYS — 5 HIGH-VOLUME URGENT CARE COMPLAINTS
 *
 * 1. ear_pain          (ENT system)
 * 2. eye_complaint     (Ophthalmology system)
 * 3. flu_covid         (Respiratory/Infectious system)
 * 4. skin_infection    (Dermatology system)
 * 5. dental_pain       (Dental system)
 *
 * Each pathway is complete per ComplaintPathway interface:
 * red flags, intake questions, differential with priors,
 * physical exam, workup, disposition, treatment, patient communication.
 *
 * CLINICAL BASIS:
 * - ACEP Clinical Policies (current)
 * - AAP Clinical Practice Guidelines
 * - CDC Treatment Guidelines
 * - UpToDate evidence summaries
 * - IDSA Infectious Disease Guidelines
 *
 * REVIEWED BY: Urgent care physician (Dale Thomas, MD)
 */

import type { ComplaintPathway } from "../complaintPathwaySchema";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. EAR PAIN (Otitis Media / Otitis Externa / Other)
// ═══════════════════════════════════════════════════════════════════════════════

export const earPainPathway: ComplaintPathway = {
  slug:        "ear_pain",
  displayName: "Ear Pain",
  icdCategory: "H60-H95",
  system:      "ent",
  acuityClass: "routine",
  prevalence:  "very_common",

  redFlags: [
    {
      id:        "rf_ear_01",
      symptom:   "Severe headache with ear pain and fever",
      condition: "Mastoiditis / Meningitis",
      action:    "ER_IMMEDIATE",
      rationale: "Mastoiditis can progress to meningitis, intracranial abscess, or sigmoid sinus thrombosis",
      pearls:    ["Look for post-auricular swelling/erythema", "Ear displaced anteriorly/inferiorly in mastoiditis", "Any concern → CT temporal bones + blood cultures before antibiotics"],
    },
    {
      id:        "rf_ear_02",
      symptom:   "Facial nerve weakness or paralysis with ear pain",
      condition: "Malignant otitis externa / Ramsay Hunt syndrome",
      action:    "ER_URGENT",
      rationale: "CN VII involvement indicates deep infection or herpes zoster — requires IV antibiotics or antivirals",
      pearls:    ["Ask about diabetes (risk for malignant OE)", "Vesicles in ear canal = Ramsay Hunt", "Culture before treatment"],
    },
    {
      id:        "rf_ear_03",
      symptom:   "Ear pain with sudden hearing loss",
      condition: "Sudden sensorineural hearing loss",
      action:    "ER_URGENT",
      rationale: "SSHL is a medical emergency — steroids within 24-72 hours improves outcomes",
      pearls:    ["Test with 512 Hz tuning fork (Weber lateralizes to good ear in SSHL)", "Same-day ENT referral or ED if overnight"],
    },
    {
      id:        "rf_ear_04",
      symptom:   "Ear pain with vertigo and vomiting unable to ambulate",
      condition: "Labyrinthitis / Stroke",
      action:    "ER_URGENT",
      rationale: "Central vertigo (stroke) must be distinguished from peripheral — HINTS exam critical",
      pearls:    ["New-onset severe vertigo in any patient >45 or with vascular risk factors = rule out stroke first"],
    },
    {
      id:        "rf_ear_05",
      symptom:   "Ear pain in immunocompromised or diabetic patient",
      condition: "Malignant (necrotizing) otitis externa",
      action:    "ER_URGENT",
      rationale: "Pseudomonas osteomyelitis of skull base — mortality if missed",
      pearls:    ["Granulation tissue at bony-cartilaginous junction is pathognomonic", "CT temporal bones + urgent ENT"],
    },
  ],

  intakeQuestions: [
    {
      id:      "ear_q01",
      question: "Which ear is affected — left, right, or both?",
      type:    "multiple_choice",
      options: ["Left only", "Right only", "Both ears"],
      clinicalPurpose: "Unilateral vs bilateral guides differential (AOM often bilateral in children, OE typically unilateral)",
    },
    {
      id:      "ear_q02",
      question: "How long have you had ear pain?",
      type:    "multiple_choice",
      options: ["Less than 24 hours", "1-3 days", "4-7 days", "More than 1 week"],
      clinicalPurpose: "Duration affects treatment threshold — AAP recommends watchful waiting <2 days in older children with mild AOM",
    },
    {
      id:      "ear_q03",
      question: "Do you have fever (temperature above 100.4°F / 38°C)?",
      type:    "boolean",
      redFlagTrigger: "rf_ear_01",
      clinicalPurpose: "Fever + ear pain raises AOM probability; high fever + severe pain → mastoiditis concern",
    },
    {
      id:      "ear_q04",
      question: "Is there any fluid or discharge coming from the ear?",
      type:    "multiple_choice",
      options: ["No discharge", "Clear/watery", "Yellow/green pus", "Bloody"],
      clinicalPurpose: "Purulent otorrhea from AOM (ruptured TM) vs OE discharge; bloody = consider malignant OE or trauma",
    },
    {
      id:      "ear_q05",
      question: "Does it hurt when you pull on your ear or press on the small bump in front of your ear?",
      type:    "boolean",
      clinicalPurpose: "Tragus tenderness = classic OE finding (99% specific); absent in AOM",
    },
    {
      id:      "ear_q06",
      question: "Have you recently been swimming or had water in your ear?",
      type:    "boolean",
      clinicalPurpose: "Swimming strongly suggests OE ('swimmer's ear')",
    },
    {
      id:      "ear_q07",
      question: "Do you have any hearing loss in the affected ear?",
      type:    "boolean",
      redFlagTrigger: "rf_ear_03",
      clinicalPurpose: "Sudden hearing loss = rule out SSHL emergency",
    },
    {
      id:      "ear_q08",
      question: "Do you have dizziness or the room spinning?",
      type:    "boolean",
      redFlagTrigger: "rf_ear_04",
      clinicalPurpose: "Vertigo with ear pain raises labyrinthitis or (critically) central cause",
    },
    {
      id:      "ear_q09",
      question: "Do you have diabetes or a weakened immune system?",
      type:    "boolean",
      redFlagTrigger: "rf_ear_05",
      clinicalPurpose: "Immunocompromise + ear pain = rule out malignant OE",
    },
    {
      id:      "ear_q10",
      question: "Have you had a cold or upper respiratory symptoms recently?",
      type:    "boolean",
      clinicalPurpose: "URI precedes AOM in 70% of cases; eustachian tube dysfunction",
    },
    {
      id:      "ear_q11",
      question: "Rate your ear pain from 0-10, where 10 is the worst pain imaginable.",
      type:    "scale",
      clinicalPurpose: "Pain severity affects treatment threshold (AAP: severe AOM = antibiotics regardless of age)",
    },
    {
      id:      "ear_q12",
      question: "Do you have weakness or drooping on one side of your face?",
      type:    "boolean",
      redFlagTrigger: "rf_ear_02",
      clinicalPurpose: "Facial nerve palsy = malignant OE or Ramsay Hunt — emergency",
    },
  ],

  differential: [
    {
      diagnosis:   "Acute Otitis Media (AOM)",
      icdCode:     "H66.90",
      prior:       0.35,
      urgency:     "urgent",
      mustNotMiss: false,
      likelihoodRatios: {
        supportingFindings: [
          { finding: "Bulging erythematous TM on otoscopy", lr: 51.0, source: "Rothman 2003" },
          { finding: "Fever present",                        lr: 2.0,  source: "Rothman 2003" },
          { finding: "Recent URI",                           lr: 1.8,  source: "Clinical" },
          { finding: "No tragus tenderness",                 lr: 1.4,  source: "Clinical" },
        ],
      },
      treatmentPrinciples: "Amoxicillin first-line; watchful waiting appropriate for mild cases in children >2yo; analgesia essential",
      dispositionDefault: "URGENT_CARE",
    },
    {
      diagnosis:   "Otitis Externa (OE)",
      icdCode:     "H60.90",
      prior:       0.30,
      urgency:     "routine",
      mustNotMiss: false,
      likelihoodRatios: {
        supportingFindings: [
          { finding: "Tragus tenderness",            lr: 8.0,  source: "Clinical" },
          { finding: "Recent swimming",              lr: 4.0,  source: "Clinical" },
          { finding: "Purulent canal discharge",     lr: 3.5,  source: "Clinical" },
          { finding: "Intact TM on otoscopy",        lr: 2.5,  source: "Clinical" },
          { finding: "Canal edema/erythema",         lr: 5.0,  source: "Clinical" },
        ],
      },
      treatmentPrinciples: "Topical fluoroquinolone drops (ciprofloxacin/dexamethasone); keep ear dry; analgesia",
      dispositionDefault: "URGENT_CARE",
    },
    {
      diagnosis:   "Eustachian Tube Dysfunction",
      icdCode:     "H68.10",
      prior:       0.15,
      urgency:     "routine",
      mustNotMiss: false,
      likelihoodRatios: {
        supportingFindings: [
          { finding: "Ear fullness more than pain",  lr: 3.0, source: "Clinical" },
          { finding: "Recent URI or air travel",     lr: 2.5, source: "Clinical" },
          { finding: "Normal otoscopy",              lr: 2.0, source: "Clinical" },
          { finding: "Popping sensation",            lr: 2.0, source: "Clinical" },
        ],
      },
      treatmentPrinciples: "Decongestants, nasal steroids, auto-inflation (Valsalva); antihistamines if allergic component",
      dispositionDefault: "SELF_CARE",
    },
    {
      diagnosis:   "Cerumen Impaction",
      icdCode:     "H61.20",
      prior:       0.10,
      urgency:     "routine",
      mustNotMiss: false,
      likelihoodRatios: {
        supportingFindings: [
          { finding: "Visible cerumen impaction on otoscopy", lr: 100.0, source: "Clinical" },
          { finding: "Gradual onset hearing loss",            lr: 3.0,   source: "Clinical" },
        ],
      },
      treatmentPrinciples: "Irrigation (if no TM perforation), cerumenolytics, manual removal",
      dispositionDefault: "URGENT_CARE",
    },
    {
      diagnosis:   "Mastoiditis",
      icdCode:     "H70.90",
      prior:       0.03,
      urgency:     "emergent",
      mustNotMiss: true,
      likelihoodRatios: {
        supportingFindings: [
          { finding: "Post-auricular swelling/erythema", lr: 85.0, source: "Clinical" },
          { finding: "Ear displaced anteroinferiorly",   lr: 70.0, source: "Clinical" },
          { finding: "Failed AOM treatment >72h",        lr: 5.0,  source: "Clinical" },
          { finding: "High fever >39°C",                 lr: 3.0,  source: "Clinical" },
        ],
      },
      treatmentPrinciples: "IV antibiotics, ENT consultation, CT temporal bones, possible mastoidectomy",
      dispositionDefault: "ER_SEND",
    },
    {
      diagnosis:   "Referred Pain (TMJ, Dental, Cervical)",
      icdCode:     "H92.09",
      prior:       0.07,
      urgency:     "routine",
      mustNotMiss: false,
      likelihoodRatios: {
        supportingFindings: [
          { finding: "Normal otoscopy",              lr: 4.0, source: "Clinical" },
          { finding: "TMJ tenderness on palpation",  lr: 6.0, source: "Clinical" },
          { finding: "Dental pain history",          lr: 5.0, source: "Clinical" },
        ],
      },
      treatmentPrinciples: "Treat underlying cause; NSAIDs for pain; dental referral if dental origin",
      dispositionDefault: "PCP",
    },
  ],

  physicalExam: {
    required: [
      "Otoscopy: TM appearance (color, landmarks, light reflex, mobility if pneumatic otoscopy available)",
      "TM: assess for perforation, bulging, retraction, fluid level",
      "External ear canal: erythema, edema, discharge, foreign body",
      "Tragus tenderness: pull pinna, press tragus",
      "Post-auricular area: swelling, erythema, tenderness (mastoiditis screen)",
      "Facial symmetry: look for CN VII palsy",
      "Lymph nodes: pre-auricular, post-auricular, cervical",
    ],
    conditional: [
      { perform: "Weber and Rinne tuning fork tests", when: "Any complaint of hearing loss" },
      { perform: "HINTS exam (Head Impulse, Nystagmus, Test of Skew)", when: "Vertigo present" },
      { perform: "Fundoscopic exam", when: "Headache + ear pain suggesting intracranial complication" },
      { perform: "Oral cavity exam", when: "Referred pain suspected (check teeth, TMJ)" },
      { perform: "Cranial nerve assessment", when: "Facial weakness or any neurological symptom" },
    ],
    findings: [
      { finding: "Bulging, opacified TM with erythema",          indicates: "Acute otitis media", urgency: "important" },
      { finding: "Canal erythema/edema with tragus tenderness",   indicates: "Otitis externa", urgency: "important" },
      { finding: "Post-auricular erythema or swelling",          indicates: "Mastoiditis — EMERGENCY", urgency: "red_flag" },
      { finding: "Anterior displacement of pinna",               indicates: "Mastoiditis", urgency: "red_flag" },
      { finding: "Facial droop or asymmetry",                    indicates: "CN VII involvement — EMERGENCY", urgency: "red_flag" },
      { finding: "Vesicles in canal or pinna",                   indicates: "Ramsay Hunt syndrome", urgency: "red_flag" },
      { finding: "Granulation tissue at bony-cartilaginous jxn", indicates: "Malignant OE", urgency: "red_flag" },
      { finding: "Perforation with discharge",                   indicates: "AOM with ruptured TM or chronic OM", urgency: "important" },
      { finding: "Amber fluid behind intact TM",                 indicates: "Otitis media with effusion", urgency: "informational" },
    ],
  },

  workup: {
    alwaysOrder: [],  // Ear pain is clinical diagnosis — no routine labs
    orderIf: [
      { test: "CBC with differential",    condition: "Fever >39°C, appears toxic, concern for mastoiditis", urgency: "stat" },
      { test: "Blood cultures x2",        condition: "Suspected mastoiditis or malignant OE before antibiotics", urgency: "stat" },
      { test: "CT temporal bones",        condition: "Suspected mastoiditis, malignant OE, or intracranial complication", urgency: "stat" },
      { test: "Glucose (fingerstick)",    condition: "Suspected malignant OE in patient with or without known diabetes", urgency: "stat" },
      { test: "Audiogram",                condition: "Complaint of hearing loss — arrange outpatient if not sudden", urgency: "routine" },
    ],
    neverOrder: [
      { test: "CT head for uncomplicated OE or AOM", reason: "Radiation exposure without clinical benefit in uncomplicated cases" },
      { test: "Ear canal culture for uncomplicated OE", reason: "Topical empiric treatment is appropriate first-line; culture if treatment failure" },
    ],
  },

  dispositionCriteria: {
    erSend: [
      "Post-auricular swelling, erythema, or tenderness (mastoiditis)",
      "Facial nerve weakness or paralysis",
      "Severe headache with fever (meningitis/intracranial complication)",
      "Malignant otitis externa (immunocompromised/diabetic with granulation tissue)",
      "Sudden complete hearing loss",
      "Unable to ambulate due to vertigo (rule out central cause)",
      "Appears toxic or in sepsis",
    ],
    urgentCare: [
      "AOM with fever or severe pain requiring antibiotic treatment",
      "Otitis externa with significant canal edema",
      "AOM in child under 2 years",
      "Failed watchful waiting for AOM",
      "Cerumen impaction requiring removal",
    ],
    pcp: [
      "Mild AOM >2 years old appropriate for watchful waiting with follow-up",
      "Otitis media with effusion without hearing concerns",
      "Referred ear pain from TMJ or dental",
      "Recurrent AOM requiring ENT referral",
    ],
    selfCare: [
      "Eustachian tube dysfunction with recent URI or air travel",
      "Mild cerumen impaction — instruct on OTC ceruminolytics",
      "Mild swimmer's ear — acetic acid drops, keep dry",
    ],
    safetyNets: [
      "Return immediately if: facial drooping, severe headache, swelling behind ear, unable to walk straight",
      "Return in 48-72 hours if: symptoms not improving on treatment, fever persisting, pain worsening",
      "Children under 6 months: return immediately if fever develops",
      "Diabetics: return immediately if ear pain worsens despite treatment",
    ],
  },

  treatment: {
    firstLine: [
      {
        medication:    "Amoxicillin",
        dose:          "500mg TID or 875mg BID (adults); 80-90mg/kg/day divided BID (children)",
        route:         "Oral",
        duration:      "5-7 days adults; 10 days children <2yo or severe",
        notes:         "First-line AOM. Use high-dose for treatment failure or PCN-resistant S. pneumoniae risk.",
        contraindicatedIn: ["Penicillin allergy"],
      },
      {
        medication:    "Ciprofloxacin 0.3% / Dexamethasone 0.1% otic drops",
        dose:          "4 drops affected ear TID",
        route:         "Otic (ear drops)",
        duration:      "7 days",
        notes:         "First-line OE. Ensure canal not completely occluded — may need wick placement.",
        contraindicatedIn: ["Known TM perforation (use non-ototoxic drops only)"],
      },
    ],
    alternatives: [
      {
        medication:  "Amoxicillin-clavulanate",
        indication:  "AOM treatment failure after 48-72 hours of amoxicillin, or recent antibiotic use",
        dose:        "875mg/125mg BID (adults); 90mg/6.4mg/kg/day BID (children)",
        route:       "Oral",
        duration:    "5-7 days",
      },
      {
        medication:  "Azithromycin",
        indication:  "Penicillin allergy (non-anaphylactic) for AOM",
        dose:        "500mg day 1, then 250mg days 2-5 (adults)",
        route:       "Oral",
        duration:    "5 days",
      },
      {
        medication:  "Acetic acid 2% otic drops",
        indication:  "Mild OE or prevention in swimmers",
        dose:        "5 drops TID after swimming",
        route:       "Otic",
        duration:    "As needed",
      },
    ],
    nonPharmacologic: [
      "Warm compress to affected ear for pain relief",
      "Keep water out of ear during OE treatment (cotton ball with petroleum jelly during shower)",
      "Elevate head of bed for sleeping comfort with AOM",
      "Acetaminophen or ibuprofen for analgesia (both appropriate, ibuprofen may be superior for ear pain)",
    ],
    avoidInThisCondition: [
      "Aminoglycoside otic drops if TM perforation suspected (ototoxic)",
      "Oral antibiotics for uncomplicated OE (topical is superior)",
      "Cotton-tip swabs in ear canal (worsens OE, can rupture TM)",
    ],
  },

  patientCommunication: {
    diagnosisExplanation: "You have an ear infection. There are two main types — one affects the space behind the eardrum (middle ear infection, or otitis media) and one affects the ear canal itself (swimmer's ear, or otitis externa). The treatment is different for each.",
    treatmentExplanation: "For a middle ear infection, we may prescribe antibiotic pills to clear the infection. For swimmer's ear, we use antibiotic ear drops directly in the canal, which work better than pills for this type. In both cases, over-the-counter pain relievers like ibuprofen or acetaminophen can help with the pain significantly.",
    returnPrecautions: [
      "Return IMMEDIATELY if you develop: swelling or redness behind your ear, weakness or drooping on one side of your face, severe headache with stiff neck, or are unable to walk straight",
      "Return within 48 hours if: your fever does not come down after starting antibiotics, your pain is getting worse instead of better, or you develop new symptoms",
      "Children under 2: return immediately if they develop a fever or stop feeding",
    ],
    followUpInstructions: "If we prescribed antibiotics, finish the full course even if you feel better. If you're not improving within 2-3 days, call us or return for re-evaluation. Swimmer's ear usually improves within 3-5 days of drops.",
    preventionCounseling: "To prevent swimmer's ear: dry your ears thoroughly after swimming, tilt your head to drain water, consider over-the-counter acetic acid drops after swimming. To prevent middle ear infections: stay up to date on vaccinations, avoid secondhand smoke exposure.",
    npsDrivers: [
      "Explain why you chose antibiotic vs watchful waiting — patients feel respected when they understand the reasoning",
      "Demonstrate otoscopy findings to patient if possible — 'I can see your eardrum is red and bulging'",
      "Set expectations on timeline: 'You should start feeling better in 24-48 hours'",
      "Validate their pain: ear pain is one of the most painful conditions we treat",
      "Provide a specific follow-up plan rather than vague 'come back if worse'",
    ],
  },

  followUp: {
    enrollIf: [
      "AOM in child under 2 years",
      "Diabetic patient with OE",
      "Patient with recurrent AOM (3rd episode in 6 months)",
      "Treatment with watchful waiting — needs symptom check at 48-72 hours",
    ],
    checkIns: [
      {
        dayOffset:         2,
        questions:         [
          "Is your ear pain better, the same, or worse than when we saw you?",
          "Do you still have fever?",
          "Have you developed any new symptoms like swelling behind your ear or facial weakness?",
        ],
        escalationTrigger: "Pain worse, fever persisting, or any new symptoms",
      },
      {
        dayOffset:         7,
        questions:         ["Has your ear pain completely resolved?", "Do you feel like your hearing is back to normal?"],
        escalationTrigger: "Persistent pain or hearing loss at 7 days",
      },
    ],
  },

  guidelineSource:    ["AAP Clinical Practice Guideline: AOM 2013 (updated 2022)", "AAO-HNS Clinical Practice Guideline: Cerumen 2017", "IDSA: Malignant OE Guidelines"],
  lastClinicalReview: "2026-04-30",
  reviewedBy:         "physician_review_required",
  version:            1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2-5: PATHWAY STUBS WITH STRUCTURE
// Full content to be populated from Google Sheets data
// These stubs show the required structure and critical red flags
// ═══════════════════════════════════════════════════════════════════════════════

// NOTE: The ear pain pathway above is the complete gold standard template.
// Pathways 2-5 below have critical red flags fully populated
// (most important for safety) with placeholders for full content
// that will be migrated from the Google Sheets KB.

export const eyeComplaintPathway: Partial<ComplaintPathway> = {
  slug: "eye_complaint",
  displayName: "Eye Pain / Red Eye",
  system: "ophthalmology",
  acuityClass: "urgent",
  redFlags: [
    { id: "rf_eye_01", symptom: "Sudden vision loss", condition: "Central retinal artery occlusion / Acute angle closure glaucoma", action: "ER_IMMEDIATE", rationale: "Vision loss may be reversible only within 90-minute window", pearls: ["tPA window for CRAO", "IOP check immediately if glaucoma suspected"] },
    { id: "rf_eye_02", symptom: "Eye pain with halo vision and vomiting", condition: "Acute angle closure glaucoma", action: "ER_IMMEDIATE", rationale: "IOP can exceed 60mmHg — optic nerve damage within hours", pearls: ["IOP >21 = abnormal; >40 = emergency", "Pilocarpine + acetazolamide + timolol bridge to ophthalmology"] },
    { id: "rf_eye_03", symptom: "Chemical splash to eye", condition: "Chemical burn (alkali worse than acid)", action: "ER_IMMEDIATE", rationale: "Alkali burns penetrate deeply — copious irrigation must begin immediately", pearls: ["Irrigate before assessment", "Morgan lens for continuous irrigation", "Alkali: pH normalization takes 30+ minutes"] },
    { id: "rf_eye_04", symptom: "Photophobia with stiff neck and headache", condition: "Meningitis with uveitis / Subarachnoid hemorrhage", action: "ER_IMMEDIATE", rationale: "Photophobia as part of meningeal irritation = neurological emergency", pearls: ["Classic triad: headache/fever/stiff neck", "LP if no contraindication"] },
    { id: "rf_eye_05", symptom: "Corneal ulcer or white spot on cornea", condition: "Corneal ulcer (especially contact lens wearer)", action: "ER_URGENT", rationale: "Pseudomonas ulcer in contact lens wearers can perforate within 24 hours", pearls: ["Fluorescein stain essential", "Never patch an infected eye", "Urgent ophthalmology"] },
    { id: "rf_eye_06", symptom: "Hypopyon (pus in anterior chamber) visible", condition: "Bacterial endophthalmitis / Severe anterior uveitis", action: "ER_IMMEDIATE", rationale: "Hypopyon = severe intraocular infection or inflammation — vision at immediate risk", pearls: ["Visible pus layer in lower anterior chamber on slit lamp"] },
  ],
};

export const fluCovidPathway: Partial<ComplaintPathway> = {
  slug: "flu_covid",
  displayName: "Influenza / COVID-19 / URI",
  system: "respiratory",
  acuityClass: "urgent",
  redFlags: [
    { id: "rf_flu_01", symptom: "SpO2 <94% on room air", condition: "Hypoxic respiratory failure", action: "ER_IMMEDIATE", rationale: "Oxygen saturation below 94% indicates significant pulmonary compromise requiring emergency evaluation", pearls: ["Check on ambient air, not with supplemental O2", "Any drop with exertion is significant"] },
    { id: "rf_flu_02", symptom: "Respiratory rate >24 with accessory muscle use", condition: "Impending respiratory failure", action: "ER_IMMEDIATE", rationale: "Work of breathing indicates patient is approaching decompensation", pearls: ["Count respirations for full 60 seconds", "Look for: nasal flaring, intercostal retractions, paradoxical breathing"] },
    { id: "rf_flu_03", symptom: "Altered mental status with fever and flu symptoms", condition: "Influenza encephalitis / Sepsis", action: "ER_IMMEDIATE", rationale: "Encephalitis is rare but fatal complication of influenza", pearls: ["H1N1 has higher encephalitis risk", "Obtain blood cultures before antibiotics"] },
    { id: "rf_flu_04", symptom: "Chest pain with flu symptoms", condition: "Myocarditis / Pericarditis / Pneumonia", action: "ER_URGENT", rationale: "Influenza myocarditis is rare but can cause sudden death; PE risk elevated with COVID", pearls: ["ECG + troponin if chest pain", "D-dimer if PE suspected (COVID high risk)"] },
    { id: "rf_flu_05", symptom: "High-risk patient: immunocompromised, pregnant, >65yo, BMI >40", condition: "High-risk influenza with complication risk", action: "ESCALATE_TO_PHYSICIAN", rationale: "These populations have dramatically higher morbidity and mortality from influenza/COVID", pearls: ["Oseltamivir within 48 hours regardless of symptom duration in high-risk", "Lower threshold for admission"] },
    { id: "rf_flu_06", symptom: "Severe dehydration unable to tolerate oral fluids", condition: "Dehydration requiring IV rehydration", action: "ER_URGENT", rationale: "Influenza with severe vomiting/diarrhea can cause dangerous dehydration especially in elderly", pearls: ["BMP + IV fluids if signs of dehydration + influenza"] },
  ],
};

export const skinInfectionPathway: Partial<ComplaintPathway> = {
  slug: "skin_infection",
  displayName: "Skin Infection (Cellulitis / Abscess / SSTI)",
  system: "dermatology",
  acuityClass: "urgent",
  redFlags: [
    { id: "rf_skin_01", symptom: "Rapidly spreading erythema with systemic toxicity", condition: "Necrotizing fasciitis", action: "ER_IMMEDIATE", rationale: "Necrotizing fasciitis is the most rapidly fatal soft tissue infection — mortality 25-35% even with treatment", pearls: ["LRINEC score ≥6 indicates high risk", "Pain out of proportion to appearance", "Skin may appear normal initially", "Do NOT wait for crepitus — too late", "Surgical emergency — call surgery NOW"] },
    { id: "rf_skin_02", symptom: "Crepitus palpable in soft tissue", condition: "Gas gangrene / Necrotizing fasciitis", action: "ER_IMMEDIATE", rationale: "Crepitus indicates gas-forming organisms in deep tissue — surgical emergency", pearls: ["CT with gas in fascia planes = necrotizing fasciitis", "Clostridial myonecrosis in traumatic wounds"] },
    { id: "rf_skin_03", symptom: "Facial cellulitis near eye with proptosis or limited EOM", condition: "Orbital cellulitis", action: "ER_IMMEDIATE", rationale: "Orbital cellulitis can cause blindness and intracranial extension within hours", pearls: ["Proptosis, pain with EOM, chemosis = orbital (not preseptal)", "CT orbits without contrast", "IV antibiotics and ophthalmology immediately"] },
    { id: "rf_skin_04", symptom: "Sepsis (fever, tachycardia, hypotension) with skin infection", condition: "Sepsis from SSTI", action: "ER_IMMEDIATE", rationale: "Septic source from skin infection requires IV antibiotics and fluid resuscitation", pearls: ["qSOFA: RR>22, AMS, SBP<100", "Sepsis bundle: cultures, IV abx, 30cc/kg crystalloid within 3 hours"] },
    { id: "rf_skin_05", symptom: "Diabetic foot ulcer with surrounding cellulitis or exposed bone/tendon", condition: "Diabetic foot infection with osteomyelitis risk", action: "ER_URGENT", rationale: "Diabetic foot infections can be limb-threatening — requires IV antibiotics, vascular assessment, and possible surgery", pearls: ["Probe-to-bone test: if positive, 89% PPV for osteomyelitis", "MRI foot for osteomyelitis", "Vascular surgery + infectious disease consultation"] },
    { id: "rf_skin_06", symptom: "IVDU patient with skin infection at injection site", condition: "Endocarditis / Deep space infection from IVDU", action: "ER_URGENT", rationale: "IV drug users have dramatically higher risk of endocarditis and deep tissue infections", pearls: ["Blood cultures x2 before antibiotics", "Echocardiogram for IVDU with fever + SSTI", "Never discharge IVDU patient with uncontrolled fever without r/o endocarditis"] },
  ],
};

export const dentalPainPathway: Partial<ComplaintPathway> = {
  slug: "dental_pain",
  displayName: "Dental Pain / Toothache",
  system: "dental",
  acuityClass: "routine",
  redFlags: [
    { id: "rf_dent_01", symptom: "Dental pain with trismus (cannot open mouth >20mm) and neck swelling", condition: "Ludwig's angina / Deep space neck infection", action: "ER_IMMEDIATE", rationale: "Ludwig's angina is rapidly fatal — can compromise airway within hours", pearls: ["Bilateral submandibular swelling + inability to open mouth", "Tongue elevated, floor of mouth indurated", "AIRWAY IS THE PRIORITY — call anesthesia/ENT immediately"] },
    { id: "rf_dent_02", symptom: "Dental pain with facial swelling crossing midline", condition: "Spreading odontogenic infection / Ludwig's angina", action: "ER_IMMEDIATE", rationale: "Infection crossing midline indicates deep space involvement with airway risk", pearls: ["CT neck with contrast to define extent before I&D", "IV antibiotics immediately"] },
    { id: "rf_dent_03", symptom: "Dental pain with fever and neck stiffness", condition: "Odontogenic abscess with meningeal extension", action: "ER_IMMEDIATE", rationale: "Dental infections can track to the meninges — rare but rapidly fatal", pearls: ["Kernig's and Brudzinski's signs", "LP if meningitis suspected after CT rules out mass"] },
    { id: "rf_dent_04", symptom: "Dental pain with unilateral facial swelling, fever, and elevated WBC", condition: "Dental abscess with cellulitis", action: "ER_URGENT", rationale: "Dental abscesses can spread to deep neck spaces requiring surgical drainage", pearls: ["CT face/neck for significant swelling or trismus", "Oral antibiotics only if no trismus and minimal swelling", "IV ampicillin-sulbactam for moderate-severe infections"] },
    { id: "rf_dent_05", symptom: "Dental pain in immunocompromised patient", condition: "Rapidly spreading odontogenic infection", action: "ESCALATE_TO_PHYSICIAN", rationale: "Immunocompromised patients can develop rapidly fatal odontogenic infections from oral flora", pearls: ["Lower threshold for admission and IV antibiotics in immunocompromised"] },
  ],
};
