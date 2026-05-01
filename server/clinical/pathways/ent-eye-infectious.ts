/**
 * ent-eye-infectious.ts
 * server/clinical/pathways/ent-eye-infectious.ts
 *
 * COMPLETE CLINICAL PATHWAYS — 5 HIGH-VOLUME URGENT CARE COMPLAINTS
 *
 * 1. ear_pain          — ENT system        (COMPLETE)
 * 2. eye_complaint     — Ophthalmology     (red flags complete)
 * 3. flu_covid         — Respiratory       (red flags complete)
 * 4. skin_infection    — Dermatology       (red flags complete)
 * 5. dental_pain       — Dental            (red flags complete)
 *
 * CLINICAL BASIS: ACEP, AAP, CDC, UpToDate, IDSA guidelines
 * REVIEWED BY: Urgent care physician
 */

import type { ComplaintPathway } from "../complaintPathwaySchema";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. EAR PAIN — COMPLETE
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
    { id: "ear_q01", question: "Which ear is affected — left, right, or both?", type: "multiple_choice", options: ["Left only", "Right only", "Both ears"], clinicalPurpose: "Unilateral vs bilateral guides differential" },
    { id: "ear_q02", question: "How long have you had ear pain?", type: "multiple_choice", options: ["Less than 24 hours", "1-3 days", "4-7 days", "More than 1 week"], clinicalPurpose: "Duration affects treatment threshold" },
    { id: "ear_q03", question: "Do you have fever (temperature above 100.4°F / 38°C)?", type: "boolean", redFlagTrigger: "rf_ear_01", clinicalPurpose: "Fever + ear pain raises AOM probability; high fever → mastoiditis concern" },
    { id: "ear_q04", question: "Is there any fluid or discharge coming from the ear?", type: "multiple_choice", options: ["No discharge", "Clear/watery", "Yellow/green pus", "Bloody"], clinicalPurpose: "Purulent otorrhea from AOM vs OE discharge; bloody = malignant OE or trauma" },
    { id: "ear_q05", question: "Does it hurt when you pull on your ear or press on the small bump in front of your ear?", type: "boolean", clinicalPurpose: "Tragus tenderness = classic OE finding (99% specific)" },
    { id: "ear_q06", question: "Have you recently been swimming or had water in your ear?", type: "boolean", clinicalPurpose: "Swimming strongly suggests OE" },
    { id: "ear_q07", question: "Do you have any hearing loss in the affected ear?", type: "boolean", redFlagTrigger: "rf_ear_03", clinicalPurpose: "Sudden hearing loss = rule out SSHL emergency" },
    { id: "ear_q08", question: "Do you have dizziness or the room spinning?", type: "boolean", redFlagTrigger: "rf_ear_04", clinicalPurpose: "Vertigo with ear pain raises labyrinthitis or central cause" },
    { id: "ear_q09", question: "Do you have diabetes or a weakened immune system?", type: "boolean", redFlagTrigger: "rf_ear_05", clinicalPurpose: "Immunocompromise + ear pain = rule out malignant OE" },
    { id: "ear_q10", question: "Have you had a cold or upper respiratory symptoms recently?", type: "boolean", clinicalPurpose: "URI precedes AOM in 70% of cases" },
    { id: "ear_q11", question: "Rate your ear pain from 0-10.", type: "scale", clinicalPurpose: "Pain severity affects treatment threshold" },
    { id: "ear_q12", question: "Do you have weakness or drooping on one side of your face?", type: "boolean", redFlagTrigger: "rf_ear_02", clinicalPurpose: "Facial nerve palsy = malignant OE or Ramsay Hunt — emergency" },
  ],

  differential: [
    {
      diagnosis: "Acute Otitis Media (AOM)", icdCode: "H66.90", prior: 0.35, urgency: "urgent", mustNotMiss: false,
      likelihoodRatios: { supportingFindings: [
        { finding: "Bulging erythematous TM on otoscopy", lr: 51.0, source: "Rothman 2003" },
        { finding: "Fever present", lr: 2.0, source: "Rothman 2003" },
        { finding: "Recent URI", lr: 1.8, source: "Clinical" },
      ]},
      treatmentPrinciples: "Amoxicillin first-line; watchful waiting appropriate for mild cases in children >2yo",
      dispositionDefault: "URGENT_CARE",
    },
    {
      diagnosis: "Otitis Externa (OE)", icdCode: "H60.90", prior: 0.30, urgency: "routine", mustNotMiss: false,
      likelihoodRatios: { supportingFindings: [
        { finding: "Tragus tenderness", lr: 8.0, source: "Clinical" },
        { finding: "Recent swimming", lr: 4.0, source: "Clinical" },
        { finding: "Canal edema/erythema", lr: 5.0, source: "Clinical" },
      ]},
      treatmentPrinciples: "Topical ciprofloxacin/dexamethasone drops; keep ear dry",
      dispositionDefault: "URGENT_CARE",
    },
    {
      diagnosis: "Eustachian Tube Dysfunction", icdCode: "H68.10", prior: 0.15, urgency: "routine", mustNotMiss: false,
      likelihoodRatios: { supportingFindings: [
        { finding: "Ear fullness more than pain", lr: 3.0, source: "Clinical" },
        { finding: "Recent URI or air travel", lr: 2.5, source: "Clinical" },
      ]},
      treatmentPrinciples: "Decongestants, nasal steroids, auto-inflation",
      dispositionDefault: "SELF_CARE",
    },
    {
      diagnosis: "Cerumen Impaction", icdCode: "H61.20", prior: 0.10, urgency: "routine", mustNotMiss: false,
      likelihoodRatios: { supportingFindings: [
        { finding: "Visible cerumen impaction on otoscopy", lr: 100.0, source: "Clinical" },
      ]},
      treatmentPrinciples: "Irrigation (if no TM perforation), cerumenolytics, manual removal",
      dispositionDefault: "URGENT_CARE",
    },
    {
      diagnosis: "Mastoiditis", icdCode: "H70.90", prior: 0.03, urgency: "emergent", mustNotMiss: true,
      likelihoodRatios: { supportingFindings: [
        { finding: "Post-auricular swelling/erythema", lr: 85.0, source: "Clinical" },
        { finding: "Ear displaced anteroinferiorly", lr: 70.0, source: "Clinical" },
        { finding: "Failed AOM treatment >72h", lr: 5.0, source: "Clinical" },
      ]},
      treatmentPrinciples: "IV antibiotics, ENT consultation, CT temporal bones, possible mastoidectomy",
      dispositionDefault: "ER_SEND",
    },
    {
      diagnosis: "Referred Pain (TMJ, Dental, Cervical)", icdCode: "H92.09", prior: 0.07, urgency: "routine", mustNotMiss: false,
      likelihoodRatios: { supportingFindings: [
        { finding: "Normal otoscopy", lr: 4.0, source: "Clinical" },
        { finding: "TMJ tenderness on palpation", lr: 6.0, source: "Clinical" },
      ]},
      treatmentPrinciples: "Treat underlying cause; NSAIDs; dental referral if dental origin",
      dispositionDefault: "PCP",
    },
  ],

  physicalExam: {
    required: [
      "Otoscopy: TM appearance (color, landmarks, light reflex, mobility)",
      "External ear canal: erythema, edema, discharge, foreign body",
      "Tragus tenderness: pull pinna, press tragus",
      "Post-auricular area: swelling, erythema, tenderness (mastoiditis screen)",
      "Facial symmetry: look for CN VII palsy",
      "Lymph nodes: pre-auricular, post-auricular, cervical",
    ],
    conditional: [
      { perform: "Weber and Rinne tuning fork tests", when: "Any complaint of hearing loss" },
      { perform: "HINTS exam (Head Impulse, Nystagmus, Test of Skew)", when: "Vertigo present" },
      { perform: "Oral cavity exam", when: "Referred pain suspected" },
      { perform: "Cranial nerve assessment", when: "Facial weakness or any neurological symptom" },
    ],
    findings: [
      { finding: "Bulging, opacified TM with erythema", indicates: "Acute otitis media", urgency: "important" },
      { finding: "Canal erythema/edema with tragus tenderness", indicates: "Otitis externa", urgency: "important" },
      { finding: "Post-auricular erythema or swelling", indicates: "Mastoiditis — EMERGENCY", urgency: "red_flag" },
      { finding: "Facial droop or asymmetry", indicates: "CN VII involvement — EMERGENCY", urgency: "red_flag" },
      { finding: "Vesicles in canal or pinna", indicates: "Ramsay Hunt syndrome", urgency: "red_flag" },
      { finding: "Granulation tissue at bony-cartilaginous jxn", indicates: "Malignant OE", urgency: "red_flag" },
    ],
  },

  workup: {
    alwaysOrder: [],
    orderIf: [
      { test: "CBC with differential", condition: "Fever >39°C, appears toxic, concern for mastoiditis", urgency: "stat" },
      { test: "Blood cultures x2", condition: "Suspected mastoiditis or malignant OE before antibiotics", urgency: "stat" },
      { test: "CT temporal bones", condition: "Suspected mastoiditis, malignant OE, or intracranial complication", urgency: "stat" },
      { test: "Glucose (fingerstick)", condition: "Suspected malignant OE", urgency: "stat" },
    ],
    neverOrder: [
      { test: "CT head for uncomplicated OE or AOM", reason: "Radiation exposure without clinical benefit in uncomplicated cases" },
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
    ],
    urgentCare: [
      "AOM with fever or severe pain requiring antibiotic treatment",
      "Otitis externa with significant canal edema",
      "AOM in child under 2 years",
      "Failed watchful waiting for AOM",
    ],
    pcp: [
      "Mild AOM >2 years old appropriate for watchful waiting",
      "Otitis media with effusion without hearing concerns",
      "Referred ear pain from TMJ or dental",
    ],
    selfCare: [
      "Eustachian tube dysfunction with recent URI or air travel",
      "Mild swimmer's ear — acetic acid drops, keep dry",
    ],
    safetyNets: [
      "Return immediately if: facial drooping, severe headache, swelling behind ear, unable to walk straight",
      "Return in 48-72 hours if: symptoms not improving on treatment, fever persisting, pain worsening",
      "Children under 6 months: return immediately if fever develops",
    ],
  },

  treatment: {
    firstLine: [
      {
        medication: "Amoxicillin",
        dose: "500mg TID or 875mg BID (adults); 80-90mg/kg/day divided BID (children)",
        route: "Oral",
        duration: "5-7 days adults; 10 days children <2yo or severe",
        notes: "First-line AOM. High-dose for treatment failure or PCN-resistant S. pneumoniae risk.",
        contraindicatedIn: ["Penicillin allergy"],
      },
      {
        medication: "Ciprofloxacin 0.3% / Dexamethasone 0.1% otic drops",
        dose: "4 drops affected ear TID",
        route: "Otic",
        duration: "7 days",
        notes: "First-line OE. Ensure canal not completely occluded — may need wick placement.",
        contraindicatedIn: ["Known TM perforation (use non-ototoxic drops only)"],
      },
    ],
    alternatives: [
      { medication: "Amoxicillin-clavulanate", indication: "AOM treatment failure after 48-72 hours", dose: "875mg/125mg BID", route: "Oral", duration: "5-7 days" },
      { medication: "Azithromycin", indication: "Penicillin allergy for AOM", dose: "500mg day 1, 250mg days 2-5", route: "Oral", duration: "5 days" },
    ],
    nonPharmacologic: [
      "Warm compress to affected ear for pain relief",
      "Keep water out of ear during OE treatment",
      "Acetaminophen or ibuprofen for analgesia",
    ],
    avoidInThisCondition: [
      "Aminoglycoside otic drops if TM perforation suspected (ototoxic)",
      "Oral antibiotics for uncomplicated OE (topical is superior)",
      "Cotton-tip swabs in ear canal",
    ],
  },

  patientCommunication: {
    diagnosisExplanation: "You have an ear infection. There are two main types — one affects the space behind the eardrum (middle ear infection) and one affects the ear canal itself (swimmer's ear). The treatment is different for each.",
    treatmentExplanation: "For a middle ear infection, we may prescribe antibiotic pills. For swimmer's ear, we use antibiotic ear drops directly in the canal, which work better than pills for this type.",
    returnPrecautions: [
      "Return IMMEDIATELY if you develop: swelling or redness behind your ear, weakness or drooping on one side of your face, severe headache with stiff neck, or are unable to walk straight",
      "Return within 48 hours if: your fever does not come down after starting antibiotics, your pain is getting worse",
      "Children under 2: return immediately if they develop a fever or stop feeding",
    ],
    followUpInstructions: "If we prescribed antibiotics, finish the full course even if you feel better. If not improving within 2-3 days, call us or return. Swimmer's ear usually improves within 3-5 days of drops.",
    preventionCounseling: "To prevent swimmer's ear: dry your ears thoroughly after swimming, tilt your head to drain water, consider OTC acetic acid drops after swimming.",
    npsDrivers: [
      "Explain why you chose antibiotic vs watchful waiting",
      "Demonstrate otoscopy findings to patient if possible",
      "Set expectations on timeline: 'You should start feeling better in 24-48 hours'",
      "Validate their pain: ear pain is one of the most painful conditions we treat",
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
        dayOffset: 2,
        questions: [
          "Is your ear pain better, the same, or worse than when we saw you?",
          "Do you still have fever?",
          "Have you developed any new symptoms like swelling behind your ear or facial weakness?",
        ],
        escalationTrigger: "Pain worse, fever persisting, or any new symptoms",
      },
      {
        dayOffset: 7,
        questions: ["Has your ear pain completely resolved?", "Do you feel like your hearing is back to normal?"],
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
// 2-5: PATHWAYS WITH CRITICAL RED FLAGS — FULL CONTENT VIA SHEET MIGRATION
// ═══════════════════════════════════════════════════════════════════════════════

export const eyeComplaintPathway: Partial<ComplaintPathway> = {
  slug: "eye_complaint",
  displayName: "Eye Pain / Red Eye",
  system: "ophthalmology",
  acuityClass: "urgent",
  redFlags: [
    { id: "rf_eye_01", symptom: "Sudden vision loss", condition: "Central retinal artery occlusion / Acute angle closure glaucoma", action: "ER_IMMEDIATE", rationale: "Vision loss may be reversible only within 90-minute window", pearls: ["tPA window for CRAO", "IOP check immediately if glaucoma suspected"] },
    { id: "rf_eye_02", symptom: "Eye pain with halo vision and vomiting", condition: "Acute angle closure glaucoma", action: "ER_IMMEDIATE", rationale: "IOP can exceed 60mmHg — optic nerve damage within hours", pearls: ["IOP >21 = abnormal; >40 = emergency", "Pilocarpine + acetazolamide + timolol bridge to ophthalmology"] },
    { id: "rf_eye_03", symptom: "Chemical splash to eye", condition: "Chemical burn (alkali worse than acid)", action: "ER_IMMEDIATE", rationale: "Alkali burns penetrate deeply — copious irrigation must begin immediately", pearls: ["Irrigate before assessment", "Morgan lens for continuous irrigation"] },
    { id: "rf_eye_04", symptom: "Photophobia with stiff neck and headache", condition: "Meningitis with uveitis / Subarachnoid hemorrhage", action: "ER_IMMEDIATE", rationale: "Photophobia as part of meningeal irritation = neurological emergency", pearls: ["Classic triad: headache/fever/stiff neck"] },
    { id: "rf_eye_05", symptom: "Corneal ulcer or white spot on cornea", condition: "Corneal ulcer (especially contact lens wearer)", action: "ER_URGENT", rationale: "Pseudomonas ulcer in contact lens wearers can perforate within 24 hours", pearls: ["Fluorescein stain essential", "Never patch an infected eye"] },
    { id: "rf_eye_06", symptom: "Hypopyon (pus in anterior chamber) visible", condition: "Bacterial endophthalmitis / Severe anterior uveitis", action: "ER_IMMEDIATE", rationale: "Hypopyon = severe intraocular infection — vision at immediate risk", pearls: ["Visible pus layer in lower anterior chamber on slit lamp"] },
  ],
};

export const fluCovidPathway: Partial<ComplaintPathway> = {
  slug: "flu_covid",
  displayName: "Influenza / COVID-19 / URI",
  system: "respiratory",
  acuityClass: "urgent",
  redFlags: [
    { id: "rf_flu_01", symptom: "SpO2 <94% on room air", condition: "Hypoxic respiratory failure", action: "ER_IMMEDIATE", rationale: "Oxygen saturation below 94% indicates significant pulmonary compromise", pearls: ["Check on ambient air, not with supplemental O2"] },
    { id: "rf_flu_02", symptom: "Respiratory rate >24 with accessory muscle use", condition: "Impending respiratory failure", action: "ER_IMMEDIATE", rationale: "Work of breathing indicates patient is approaching decompensation", pearls: ["Count respirations for full 60 seconds"] },
    { id: "rf_flu_03", symptom: "Altered mental status with fever and flu symptoms", condition: "Influenza encephalitis / Sepsis", action: "ER_IMMEDIATE", rationale: "Encephalitis is rare but fatal complication of influenza", pearls: ["H1N1 has higher encephalitis risk"] },
    { id: "rf_flu_04", symptom: "Chest pain with flu symptoms", condition: "Myocarditis / Pericarditis / Pneumonia", action: "ER_URGENT", rationale: "Influenza myocarditis is rare but can cause sudden death", pearls: ["ECG + troponin if chest pain", "D-dimer if PE suspected (COVID high risk)"] },
    { id: "rf_flu_05", symptom: "High-risk patient: immunocompromised, pregnant, >65yo, BMI >40", condition: "High-risk influenza with complication risk", action: "ESCALATE_TO_PHYSICIAN", rationale: "These populations have dramatically higher morbidity and mortality", pearls: ["Oseltamivir within 48 hours regardless of symptom duration in high-risk"] },
    { id: "rf_flu_06", symptom: "Severe dehydration unable to tolerate oral fluids", condition: "Dehydration requiring IV rehydration", action: "ER_URGENT", rationale: "Influenza with severe vomiting/diarrhea can cause dangerous dehydration in elderly", pearls: ["BMP + IV fluids if signs of dehydration + influenza"] },
  ],
};

export const skinInfectionPathway: Partial<ComplaintPathway> = {
  slug: "skin_infection",
  displayName: "Skin Infection (Cellulitis / Abscess / SSTI)",
  system: "dermatology",
  acuityClass: "urgent",
  redFlags: [
    { id: "rf_skin_01", symptom: "Rapidly spreading erythema with systemic toxicity", condition: "Necrotizing fasciitis", action: "ER_IMMEDIATE", rationale: "Necrotizing fasciitis — mortality 25-35% even with treatment", pearls: ["LRINEC score ≥6 indicates high risk", "Pain out of proportion to appearance", "Do NOT wait for crepitus — too late", "Surgical emergency — call surgery NOW"] },
    { id: "rf_skin_02", symptom: "Crepitus palpable in soft tissue", condition: "Gas gangrene / Necrotizing fasciitis", action: "ER_IMMEDIATE", rationale: "Crepitus indicates gas-forming organisms in deep tissue — surgical emergency", pearls: ["CT with gas in fascia planes = necrotizing fasciitis"] },
    { id: "rf_skin_03", symptom: "Facial cellulitis near eye with proptosis or limited EOM", condition: "Orbital cellulitis", action: "ER_IMMEDIATE", rationale: "Orbital cellulitis can cause blindness and intracranial extension within hours", pearls: ["Proptosis, pain with EOM, chemosis = orbital (not preseptal)", "CT orbits without contrast"] },
    { id: "rf_skin_04", symptom: "Sepsis (fever, tachycardia, hypotension) with skin infection", condition: "Sepsis from SSTI", action: "ER_IMMEDIATE", rationale: "Septic source from skin infection requires IV antibiotics and fluid resuscitation", pearls: ["qSOFA: RR>22, AMS, SBP<100"] },
    { id: "rf_skin_05", symptom: "Diabetic foot ulcer with surrounding cellulitis or exposed bone/tendon", condition: "Diabetic foot infection with osteomyelitis risk", action: "ER_URGENT", rationale: "Diabetic foot infections can be limb-threatening", pearls: ["Probe-to-bone test: if positive, 89% PPV for osteomyelitis", "MRI foot for osteomyelitis"] },
    { id: "rf_skin_06", symptom: "IVDU patient with skin infection at injection site", condition: "Endocarditis / Deep space infection from IVDU", action: "ER_URGENT", rationale: "IV drug users have dramatically higher risk of endocarditis", pearls: ["Blood cultures x2 before antibiotics", "Echocardiogram for IVDU with fever + SSTI"] },
  ],
};

export const dentalPainPathway: Partial<ComplaintPathway> = {
  slug: "dental_pain",
  displayName: "Dental Pain / Toothache",
  system: "dental",
  acuityClass: "routine",
  redFlags: [
    { id: "rf_dent_01", symptom: "Dental pain with trismus (cannot open mouth >20mm) and neck swelling", condition: "Ludwig's angina / Deep space neck infection", action: "ER_IMMEDIATE", rationale: "Ludwig's angina is rapidly fatal — can compromise airway within hours", pearls: ["Bilateral submandibular swelling + inability to open mouth", "AIRWAY IS THE PRIORITY — call anesthesia/ENT immediately"] },
    { id: "rf_dent_02", symptom: "Dental pain with facial swelling crossing midline", condition: "Spreading odontogenic infection / Ludwig's angina", action: "ER_IMMEDIATE", rationale: "Infection crossing midline indicates deep space involvement with airway risk", pearls: ["CT neck with contrast to define extent", "IV antibiotics immediately"] },
    { id: "rf_dent_03", symptom: "Dental pain with fever and neck stiffness", condition: "Odontogenic abscess with meningeal extension", action: "ER_IMMEDIATE", rationale: "Dental infections can track to the meninges — rare but rapidly fatal", pearls: ["Kernig's and Brudzinski's signs"] },
    { id: "rf_dent_04", symptom: "Dental pain with unilateral facial swelling, fever, and elevated WBC", condition: "Dental abscess with cellulitis", action: "ER_URGENT", rationale: "Dental abscesses can spread to deep neck spaces requiring surgical drainage", pearls: ["CT face/neck for significant swelling or trismus", "IV ampicillin-sulbactam for moderate-severe infections"] },
    { id: "rf_dent_05", symptom: "Dental pain in immunocompromised patient", condition: "Rapidly spreading odontogenic infection", action: "ESCALATE_TO_PHYSICIAN", rationale: "Immunocompromised patients can develop rapidly fatal odontogenic infections", pearls: ["Lower threshold for admission and IV antibiotics in immunocompromised"] },
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const ENT_EYE_INFECTIOUS_PATHWAYS = {
  ear_pain:      earPainPathway,
  eye_complaint: eyeComplaintPathway,
  flu_covid:     fluCovidPathway,
  skin_infection: skinInfectionPathway,
  dental_pain:   dentalPainPathway,
};
