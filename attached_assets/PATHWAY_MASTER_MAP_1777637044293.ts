/**
 * COMPLAINT PATHWAY MASTER MAP
 * server/clinical/PATHWAY_MASTER_MAP.md
 *
 * THE COMPLETE 23-SYSTEM URGENT CARE COMPLAINT TAXONOMY
 *
 * This is the authoritative list of every complaint pathway needed
 * for a complete urgent care clinical AI system.
 *
 * STATUS LEGEND:
 *   ✅ COMPLETE  — Full pathway: LR tables + knowledge graph + drift canary + treatment + patient comm
 *   🟡 PARTIAL   — Ontology + canary but missing LR tables / full workup / treatment
 *   ❌ MISSING   — Not built at all
 *   🔴 CRITICAL  — Must not miss; fatal if error
 *
 * PRIORITY LEGEND:
 *   P1 — Build immediately (most common + most dangerous)
 *   P2 — Build next quarter
 *   P3 — Build within 6 months
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 1: CARDIOVASCULAR (13 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const CARDIOVASCULAR = [
  { slug: "chest_pain",             name: "Chest Pain",                      status: "✅", priority: "P1", critical: true },
  { slug: "hypertensive_urgency",   name: "Hypertensive Urgency/Emergency",  status: "🟡", priority: "P1", critical: true },
  { slug: "palpitations",           name: "Palpitations / Arrhythmia",       status: "❌", priority: "P1", critical: true },
  { slug: "syncope",                name: "Syncope / Near-syncope",          status: "❌", priority: "P1", critical: true },
  { slug: "dvt_pe",                 name: "DVT / Pulmonary Embolism",        status: "🟡", priority: "P1", critical: true },
  { slug: "leg_swelling",           name: "Leg Swelling / Edema",            status: "🟡", priority: "P2", critical: false },
  { slug: "decompensated_heart_failure", name: "Heart Failure Exacerbation", status: "🟡", priority: "P1", critical: true },
  { slug: "peripheral_arterial",    name: "Peripheral Arterial Disease",     status: "❌", priority: "P2", critical: true },
  { slug: "aortic_dissection_screen", name: "Severe Tearing Chest/Back Pain", status: "❌", priority: "P1", critical: true },
  { slug: "atrial_fibrillation",    name: "Atrial Fibrillation (new onset)", status: "❌", priority: "P1", critical: true },
  { slug: "hypertensive_headache",  name: "Hypertensive Headache",           status: "❌", priority: "P2", critical: false },
  { slug: "anticoagulation_mgmt",   name: "Anticoagulation Management",      status: "❌", priority: "P2", critical: true },
  { slug: "chest_wall_pain",        name: "Chest Wall / Musculoskeletal Pain", status: "❌", priority: "P2", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 2: RESPIRATORY (12 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const RESPIRATORY = [
  { slug: "shortness_of_breath",    name: "Shortness of Breath",             status: "🟡", priority: "P1", critical: true },
  { slug: "asthma_exacerbation",    name: "Asthma Exacerbation",             status: "🟡", priority: "P1", critical: true },
  { slug: "copd_exacerbation",      name: "COPD Exacerbation",               status: "🟡", priority: "P1", critical: true },
  { slug: "flu_covid",              name: "Influenza / COVID-19",             status: "🟡", priority: "P1", critical: false },
  { slug: "upper_respiratory",      name: "Upper Respiratory Infection",     status: "❌", priority: "P2", critical: false },
  { slug: "pneumonia",              name: "Community-Acquired Pneumonia",    status: "❌", priority: "P1", critical: true },
  { slug: "cough_chronic",          name: "Chronic Cough",                   status: "❌", priority: "P3", critical: false },
  { slug: "croup",                  name: "Croup (Pediatric)",               status: "❌", priority: "P1", critical: true },
  { slug: "bronchitis",             name: "Acute Bronchitis",                status: "❌", priority: "P2", critical: false },
  { slug: "hemoptysis",             name: "Coughing Blood",                  status: "❌", priority: "P1", critical: true },
  { slug: "sleep_apnea",            name: "Sleep Apnea Evaluation",          status: "❌", priority: "P3", critical: false },
  { slug: "anaphylaxis",            name: "Anaphylaxis / Severe Allergy",    status: "❌", priority: "P1", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 3: GASTROINTESTINAL (15 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const GASTROINTESTINAL = [
  { slug: "abdominal_pain",         name: "Abdominal Pain (General)",        status: "🟡", priority: "P1", critical: true },
  { slug: "nausea_vomiting",        name: "Nausea / Vomiting",               status: "❌", priority: "P1", critical: false },
  { slug: "diarrhea",               name: "Diarrhea / Gastroenteritis",      status: "❌", priority: "P2", critical: false },
  { slug: "constipation",           name: "Constipation",                    status: "❌", priority: "P3", critical: false },
  { slug: "rectal_bleeding",        name: "Rectal Bleeding / GI Bleed",      status: "❌", priority: "P1", critical: true },
  { slug: "gerd_heartburn",         name: "GERD / Heartburn",                status: "❌", priority: "P3", critical: false },
  { slug: "appendicitis_screen",    name: "Right Lower Quadrant Pain",       status: "❌", priority: "P1", critical: true },
  { slug: "gallbladder",            name: "Right Upper Quadrant Pain",       status: "❌", priority: "P1", critical: true },
  { slug: "pancreatitis",           name: "Epigastric Pain / Pancreatitis",  status: "❌", priority: "P1", critical: true },
  { slug: "diverticulitis",         name: "Left Lower Quadrant Pain",        status: "❌", priority: "P1", critical: true },
  { slug: "hernia",                 name: "Hernia Evaluation",               status: "❌", priority: "P2", critical: true },
  { slug: "bowel_obstruction",      name: "Abdominal Distention / Obstruction", status: "❌", priority: "P1", critical: true },
  { slug: "anal_rectal",            name: "Anal/Rectal Pain (Hemorrhoids / Fissure / Abscess)", status: "❌", priority: "P2", critical: false },
  { slug: "food_poisoning",         name: "Food Poisoning",                  status: "❌", priority: "P2", critical: false },
  { slug: "jaundice",               name: "Jaundice / Liver Disease",        status: "❌", priority: "P1", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 4: GENITOURINARY (10 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const GENITOURINARY = [
  { slug: "uti",                    name: "Urinary Tract Infection",         status: "🟡", priority: "P1", critical: false },
  { slug: "kidney_stone",           name: "Renal Colic / Kidney Stone",      status: "❌", priority: "P1", critical: true },
  { slug: "urinary_retention",      name: "Urinary Retention",               status: "❌", priority: "P1", critical: true },
  { slug: "hematuria",              name: "Blood in Urine",                  status: "❌", priority: "P1", critical: true },
  { slug: "testicular_pain",        name: "Testicular Pain (Torsion screen)", status: "❌", priority: "P1", critical: true },
  { slug: "penile_complaints",      name: "Penile Complaints",               status: "❌", priority: "P2", critical: false },
  { slug: "vaginal_discharge",      name: "Vaginal Discharge / Vaginitis",   status: "❌", priority: "P2", critical: false },
  { slug: "pelvic_pain_female",     name: "Pelvic Pain (Female)",            status: "❌", priority: "P1", critical: true },
  { slug: "ectopic_screen",         name: "Early Pregnancy / Ectopic Screen", status: "❌", priority: "P1", critical: true },
  { slug: "incontinence",           name: "Urinary Incontinence",            status: "❌", priority: "P3", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 5: MUSCULOSKELETAL (15 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const MUSCULOSKELETAL = [
  { slug: "back_pain",              name: "Low Back Pain",                   status: "🟡", priority: "P1", critical: true }, // cauda equina = critical
  { slug: "neck_pain",              name: "Neck Pain",                       status: "❌", priority: "P1", critical: true }, // c-spine injury
  { slug: "shoulder_pain",          name: "Shoulder Pain",                   status: "❌", priority: "P2", critical: false },
  { slug: "knee_pain",              name: "Knee Pain",                       status: "❌", priority: "P2", critical: false },
  { slug: "ankle_injury",           name: "Ankle / Foot Injury",             status: "🟡", priority: "P2", critical: false },
  { slug: "wrist_hand_injury",      name: "Wrist / Hand Injury",             status: "❌", priority: "P2", critical: false },
  { slug: "fracture_general",       name: "Suspected Fracture",              status: "❌", priority: "P1", critical: true },
  { slug: "joint_pain_polyarticular", name: "Joint Pain (Multiple Joints)",  status: "❌", priority: "P2", critical: true }, // septic arthritis
  { slug: "monoarticular_joint",    name: "Single Joint Pain / Swelling",    status: "❌", priority: "P1", critical: true }, // septic joint
  { slug: "muscle_strain",          name: "Muscle Strain / Sprain",          status: "❌", priority: "P3", critical: false },
  { slug: "hip_pain",               name: "Hip Pain",                        status: "❌", priority: "P2", critical: true }, // femoral neck fracture
  { slug: "elbow_pain",             name: "Elbow Pain",                      status: "❌", priority: "P2", critical: false },
  { slug: "foot_pain",              name: "Foot Pain (Non-traumatic)",       status: "❌", priority: "P3", critical: false },
  { slug: "tendinopathy",           name: "Tendon Injury / Tendinopathy",    status: "❌", priority: "P3", critical: false },
  { slug: "compartment_syndrome",   name: "Extremity Pain After Trauma",     status: "❌", priority: "P1", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 6: DERMATOLOGY (12 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const DERMATOLOGY = [
  { slug: "skin_infection",         name: "Cellulitis / Abscess / SSTI",     status: "🟡", priority: "P1", critical: true }, // necrotizing fasciitis
  { slug: "rash_mild",              name: "Rash (General)",                  status: "🟡", priority: "P1", critical: true }, // meningococcemia
  { slug: "urticaria",              name: "Hives / Urticaria",               status: "❌", priority: "P1", critical: true }, // anaphylaxis
  { slug: "contact_dermatitis",     name: "Contact Dermatitis",              status: "❌", priority: "P2", critical: false },
  { slug: "eczema_psoriasis",       name: "Eczema / Psoriasis Flare",        status: "❌", priority: "P3", critical: false },
  { slug: "shingles",               name: "Shingles / Herpes Zoster",        status: "❌", priority: "P1", critical: true }, // Ramsay Hunt, ophthalmic
  { slug: "wound_laceration",       name: "Wound / Laceration",              status: "❌", priority: "P1", critical: true },
  { slug: "burn",                   name: "Burn Injury",                     status: "❌", priority: "P1", critical: true },
  { slug: "insect_bite_sting",      name: "Insect Bite / Sting",             status: "❌", priority: "P2", critical: true }, // anaphylaxis
  { slug: "skin_cancer_concern",    name: "Skin Lesion Concern",             status: "❌", priority: "P3", critical: true },
  { slug: "fungal_infection",       name: "Fungal Skin Infection",           status: "❌", priority: "P3", critical: false },
  { slug: "scabies_lice",           name: "Scabies / Lice",                  status: "❌", priority: "P3", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 7: NEUROLOGY (12 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const NEUROLOGY = [
  { slug: "headache",               name: "Headache",                        status: "🟡", priority: "P1", critical: true }, // SAH, meningitis
  { slug: "dizziness_vertigo",      name: "Dizziness / Vertigo",             status: "❌", priority: "P1", critical: true }, // stroke
  { slug: "stroke_tia",             name: "Stroke / TIA Symptoms",           status: "❌", priority: "P1", critical: true },
  { slug: "seizure",                name: "Seizure",                         status: "❌", priority: "P1", critical: true },
  { slug: "altered_mental_status",  name: "Altered Mental Status",           status: "❌", priority: "P1", critical: true },
  { slug: "weakness_focal",         name: "Focal Weakness / Numbness",       status: "❌", priority: "P1", critical: true },
  { slug: "migraine",               name: "Migraine",                        status: "❌", priority: "P2", critical: false },
  { slug: "bells_palsy",            name: "Facial Weakness / Bell's Palsy",  status: "❌", priority: "P1", critical: true },
  { slug: "peripheral_neuropathy",  name: "Peripheral Neuropathy",           status: "❌", priority: "P3", critical: false },
  { slug: "concussion",             name: "Head Injury / Concussion",        status: "❌", priority: "P1", critical: true },
  { slug: "carpal_tunnel",          name: "Carpal Tunnel / Hand Numbness",   status: "❌", priority: "P3", critical: false },
  { slug: "meningitis_screen",      name: "Fever with Stiff Neck",           status: "❌", priority: "P1", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 8: ENT (10 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const ENT = [
  { slug: "ear_pain",               name: "Ear Pain",                        status: "✅", priority: "P1", critical: false },
  { slug: "sore_throat",            name: "Sore Throat / Pharyngitis",       status: "✅", priority: "P1", critical: true }, // peritonsillar abscess
  { slug: "sinusitis",              name: "Sinusitis",                       status: "❌", priority: "P2", critical: false },
  { slug: "nosebleed",              name: "Nosebleed / Epistaxis",           status: "❌", priority: "P1", critical: true },
  { slug: "hoarseness",             name: "Hoarseness / Voice Change",       status: "❌", priority: "P2", critical: true }, // epiglottitis
  { slug: "facial_pain",            name: "Facial Pain",                     status: "❌", priority: "P2", critical: false },
  { slug: "swallowing_difficulty",  name: "Difficulty Swallowing",           status: "❌", priority: "P1", critical: true }, // epiglottitis
  { slug: "neck_swelling",          name: "Neck Swelling / Mass",            status: "❌", priority: "P1", critical: true },
  { slug: "hearing_loss_sudden",    name: "Sudden Hearing Loss",             status: "❌", priority: "P1", critical: true },
  { slug: "tinnitus",               name: "Ringing in Ears / Tinnitus",      status: "❌", priority: "P3", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 9: OPHTHALMOLOGY (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const OPHTHALMOLOGY = [
  { slug: "eye_complaint",          name: "Eye Pain / Red Eye",              status: "🟡", priority: "P1", critical: true }, // ACG, endophthalmitis
  { slug: "pink_eye",               name: "Conjunctivitis",                  status: "🟡", priority: "P2", critical: false },
  { slug: "vision_loss_sudden",     name: "Sudden Vision Loss",              status: "❌", priority: "P1", critical: true },
  { slug: "chemical_eye",           name: "Chemical Eye Exposure",           status: "❌", priority: "P1", critical: true },
  { slug: "eye_trauma",             name: "Eye Trauma / Foreign Body",       status: "❌", priority: "P1", critical: true },
  { slug: "stye_chalazion",         name: "Stye / Eyelid Swelling",          status: "❌", priority: "P3", critical: false },
  { slug: "double_vision",          name: "Double Vision",                   status: "❌", priority: "P1", critical: true },
  { slug: "periorbital_cellulitis", name: "Periorbital / Orbital Cellulitis", status: "❌", priority: "P1", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 10: ENDOCRINE / METABOLIC (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const ENDOCRINE = [
  { slug: "hyperglycemia",          name: "High Blood Sugar / DKA",          status: "🟡", priority: "P1", critical: true },
  { slug: "hypoglycemia",           name: "Low Blood Sugar",                  status: "🟡", priority: "P1", critical: true },
  { slug: "thyroid_symptoms",       name: "Thyroid Symptoms",                status: "🟡", priority: "P2", critical: true }, // thyroid storm
  { slug: "adrenal_crisis",         name: "Adrenal Insufficiency",           status: "❌", priority: "P1", critical: true },
  { slug: "dehydration_electrolyte", name: "Dehydration / Electrolyte Imbalance", status: "❌", priority: "P1", critical: true },
  { slug: "weight_loss",            name: "Unexplained Weight Loss",         status: "❌", priority: "P3", critical: true },
  { slug: "diabetes_management",    name: "Diabetes Management (Urgent)",    status: "❌", priority: "P2", critical: false },
  { slug: "hyperthyroidism",        name: "Hyperthyroid / Thyroid Storm",    status: "❌", priority: "P1", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 11: INFECTIOUS DISEASE (10 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const INFECTIOUS = [
  { slug: "fever_adult",            name: "Fever in Adult",                  status: "❌", priority: "P1", critical: true },
  { slug: "sepsis_screen",          name: "Sepsis / Systemic Infection",     status: "❌", priority: "P1", critical: true },
  { slug: "travel_illness",         name: "Travel-Related Illness",          status: "❌", priority: "P1", critical: true }, // malaria, typhoid
  { slug: "lyme_disease",           name: "Tick Bite / Lyme Disease",        status: "❌", priority: "P2", critical: true },
  { slug: "mononucleosis",          name: "Mononucleosis",                   status: "❌", priority: "P2", critical: false },
  { slug: "strep_complications",    name: "Strep Complications (Rheumatic Fever)", status: "❌", priority: "P2", critical: true },
  { slug: "tb_screen",              name: "TB Screening",                    status: "❌", priority: "P3", critical: true },
  { slug: "hiv_concerns",           name: "HIV Concerns / PEP",              status: "❌", priority: "P2", critical: true },
  { slug: "immunization_reaction",  name: "Vaccine Reaction",                status: "❌", priority: "P2", critical: true },
  { slug: "hand_foot_mouth",        name: "Hand, Foot & Mouth (Pediatric)",  status: "❌", priority: "P2", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 12: SEXUAL HEALTH / STI (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const SEXUAL_HEALTH = [
  { slug: "std_gonorrhea_chlamydia", name: "Gonorrhea / Chlamydia",          status: "❌", priority: "P1", critical: false },
  { slug: "std_syphilis",           name: "Syphilis",                        status: "❌", priority: "P2", critical: true },
  { slug: "std_herpes",             name: "Genital Herpes",                  status: "❌", priority: "P2", critical: false },
  { slug: "pid",                    name: "Pelvic Inflammatory Disease",     status: "❌", priority: "P1", critical: true },
  { slug: "epididymitis_orchitis",  name: "Epididymitis / Orchitis",         status: "❌", priority: "P1", critical: true },
  { slug: "penile_discharge",       name: "Penile Discharge / Urethritis",   status: "❌", priority: "P2", critical: false },
  { slug: "sexual_assault",         name: "Sexual Assault (SANE protocol)",  status: "❌", priority: "P1", critical: true },
  { slug: "prep_pep",               name: "PrEP / PEP Consultation",         status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 13: PSYCHIATRIC / BEHAVIORAL (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const PSYCHIATRIC = [
  { slug: "suicidal_ideation",      name: "Suicidal Ideation",               status: "❌", priority: "P1", critical: true },
  { slug: "anxiety_panic",          name: "Anxiety / Panic Attack",          status: "❌", priority: "P2", critical: true },
  { slug: "depression_screen",      name: "Depression / PHQ Screening",      status: "❌", priority: "P2", critical: true },
  { slug: "psychosis_screen",       name: "Acute Psychosis",                 status: "❌", priority: "P1", critical: true },
  { slug: "substance_intoxication", name: "Substance Intoxication",          status: "❌", priority: "P1", critical: true },
  { slug: "alcohol_withdrawal",     name: "Alcohol Withdrawal",              status: "❌", priority: "P1", critical: true },
  { slug: "agitation",              name: "Agitation / Behavioral Emergency", status: "❌", priority: "P1", critical: true },
  { slug: "eating_disorder",        name: "Eating Disorder (Acute Complications)", status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 14: TOXICOLOGY (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const TOXICOLOGY = [
  { slug: "medication_overdose",    name: "Medication Overdose",             status: "❌", priority: "P1", critical: true },
  { slug: "opioid_overdose",        name: "Opioid Overdose",                 status: "❌", priority: "P1", critical: true },
  { slug: "carbon_monoxide",        name: "Carbon Monoxide Poisoning",       status: "❌", priority: "P1", critical: true },
  { slug: "drug_reaction",          name: "Adverse Drug Reaction",           status: "❌", priority: "P1", critical: true },
  { slug: "alcohol_poisoning",      name: "Alcohol Poisoning",               status: "❌", priority: "P1", critical: true },
  { slug: "environmental_exposure", name: "Environmental Exposure / Toxic Ingestion", status: "❌", priority: "P1", critical: true },
  { slug: "drug_seeking",           name: "Controlled Substance Request",    status: "❌", priority: "P2", critical: false },
  { slug: "medication_interaction", name: "Medication Interaction Concern",  status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 15: TRAUMA / INJURY (10 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const TRAUMA = [
  { slug: "head_trauma",            name: "Head Trauma / Concussion",        status: "❌", priority: "P1", critical: true },
  { slug: "facial_trauma",          name: "Facial Trauma",                   status: "❌", priority: "P1", critical: true },
  { slug: "extremity_trauma",       name: "Extremity Trauma / Fracture",     status: "❌", priority: "P1", critical: true },
  { slug: "chest_trauma",           name: "Chest Trauma",                    status: "❌", priority: "P1", critical: true },
  { slug: "abdominal_trauma",       name: "Abdominal Trauma",                status: "❌", priority: "P1", critical: true },
  { slug: "bite_wound",             name: "Bite Wound (Animal / Human)",     status: "❌", priority: "P2", critical: true },
  { slug: "foreign_body",           name: "Foreign Body Removal",            status: "❌", priority: "P2", critical: false },
  { slug: "burn_wound",             name: "Burn Wound Care",                 status: "❌", priority: "P1", critical: true },
  { slug: "spinal_injury",          name: "Neck / Back Injury with Neurological Concern", status: "❌", priority: "P1", critical: true },
  { slug: "wound_care",             name: "Wound / Laceration Care",         status: "❌", priority: "P2", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 16: GYNECOLOGY (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const GYNECOLOGY = [
  { slug: "vaginal_bleeding",       name: "Vaginal Bleeding (Non-pregnant)", status: "❌", priority: "P1", critical: true },
  { slug: "pregnancy_bleeding",     name: "Vaginal Bleeding in Pregnancy",   status: "❌", priority: "P1", critical: true },
  { slug: "ectopic_pregnancy",      name: "Ectopic Pregnancy Concern",       status: "❌", priority: "P1", critical: true },
  { slug: "ovarian_cyst",           name: "Ovarian Cyst / Pelvic Mass",      status: "❌", priority: "P1", critical: true },
  { slug: "dysmenorrhea",           name: "Severe Menstrual Pain",           status: "❌", priority: "P2", critical: false },
  { slug: "breast_complaint",       name: "Breast Pain / Mass",              status: "❌", priority: "P2", critical: true },
  { slug: "menopause_symptoms",     name: "Menopause / HRT Concerns",        status: "❌", priority: "P3", critical: false },
  { slug: "contraception_emergency", name: "Emergency Contraception",         status: "❌", priority: "P2", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 17: PEDIATRIC-SPECIFIC (12 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const PEDIATRIC = [
  { slug: "pediatric_fever",        name: "Fever in Child",                  status: "🟡", priority: "P1", critical: true },
  { slug: "pediatric_rash",         name: "Rash in Child",                   status: "❌", priority: "P1", critical: true },
  { slug: "pediatric_respiratory",  name: "Respiratory Distress in Child",   status: "❌", priority: "P1", critical: true },
  { slug: "pediatric_gi",           name: "Vomiting / Diarrhea in Child",    status: "❌", priority: "P1", critical: true },
  { slug: "pediatric_trauma",       name: "Pediatric Trauma / NAT concern",  status: "❌", priority: "P1", critical: true },
  { slug: "croup",                  name: "Croup",                           status: "❌", priority: "P1", critical: true },
  { slug: "febrile_seizure",        name: "Febrile Seizure",                 status: "❌", priority: "P1", critical: true },
  { slug: "kawasaki",               name: "Kawasaki Disease Screen",         status: "❌", priority: "P2", critical: true },
  { slug: "intussusception",        name: "Intussusception (Infant)",        status: "❌", priority: "P1", critical: true },
  { slug: "epiglottitis",           name: "Epiglottitis (Pediatric)",        status: "❌", priority: "P1", critical: true },
  { slug: "foreign_body_airway",    name: "Foreign Body Aspiration",         status: "❌", priority: "P1", critical: true },
  { slug: "developmental_concern",  name: "Developmental Concern",           status: "❌", priority: "P3", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 18: ALLERGY / IMMUNOLOGY (5 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const ALLERGY = [
  { slug: "anaphylaxis",            name: "Anaphylaxis",                     status: "❌", priority: "P1", critical: true },
  { slug: "allergic_reaction",      name: "Allergic Reaction (Mild-Moderate)", status: "❌", priority: "P1", critical: true },
  { slug: "drug_allergy",           name: "Drug Allergy / Reaction",         status: "❌", priority: "P1", critical: true },
  { slug: "food_allergy",           name: "Food Allergy Reaction",           status: "❌", priority: "P1", critical: true },
  { slug: "immunodeficiency",       name: "Immunocompromised Patient",       status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 19: DENTAL (5 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const DENTAL = [
  { slug: "dental_pain",            name: "Dental Pain / Toothache",         status: "🟡", priority: "P1", critical: true }, // Ludwig's angina
  { slug: "dental_abscess",         name: "Dental Abscess",                  status: "❌", priority: "P1", critical: true },
  { slug: "oral_lesion",            name: "Oral Lesion / Mouth Sore",        status: "❌", priority: "P2", critical: true },
  { slug: "trismus",                name: "Inability to Open Mouth",         status: "❌", priority: "P1", critical: true },
  { slug: "tooth_avulsion",         name: "Knocked Out Tooth",               status: "❌", priority: "P2", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 20: HEMATOLOGY / ONCOLOGY (6 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const HEMATOLOGY = [
  { slug: "anemia_symptoms",        name: "Anemia Symptoms",                 status: "❌", priority: "P2", critical: true },
  { slug: "anticoagulation_bleeding", name: "Bleeding on Anticoagulation",   status: "❌", priority: "P1", critical: true },
  { slug: "sickle_cell",            name: "Sickle Cell Crisis",              status: "❌", priority: "P1", critical: true },
  { slug: "neutropenic_fever",      name: "Neutropenic Fever (Oncology)",    status: "❌", priority: "P1", critical: true },
  { slug: "platelet_disorder",      name: "Easy Bruising / Bleeding",        status: "❌", priority: "P2", critical: true },
  { slug: "lymphadenopathy",        name: "Lymph Node Swelling",             status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 21: GENERAL / PREVENTIVE (8 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const GENERAL = [
  { slug: "medication_refill",      name: "Medication Refill",               status: "🟡", priority: "P2", critical: false },
  { slug: "pre_employment",         name: "Pre-Employment Physical",         status: "❌", priority: "P3", critical: false },
  { slug: "fatigue_malaise",        name: "Fatigue / Malaise",               status: "❌", priority: "P2", critical: true },
  { slug: "weight_gain_loss",       name: "Weight Change Concern",           status: "❌", priority: "P3", critical: true },
  { slug: "night_sweats",           name: "Night Sweats",                    status: "❌", priority: "P2", critical: true },
  { slug: "fall_elderly",           name: "Fall in Elderly Patient",         status: "❌", priority: "P1", critical: true },
  { slug: "insomnia",               name: "Sleep Problems",                  status: "❌", priority: "P3", critical: false },
  { slug: "workers_comp",           name: "Workers Compensation Injury",     status: "❌", priority: "P2", critical: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 22: VASCULAR (5 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const VASCULAR = [
  { slug: "aaa_screen",             name: "Abdominal Aortic Aneurysm Screen", status: "❌", priority: "P1", critical: true },
  { slug: "limb_ischemia",          name: "Acute Limb Ischemia",             status: "❌", priority: "P1", critical: true },
  { slug: "varicose_veins",         name: "Varicose Veins / Venous Stasis",  status: "❌", priority: "P3", critical: false },
  { slug: "raynauds",               name: "Raynaud's Phenomenon",            status: "❌", priority: "P3", critical: false },
  { slug: "wound_non_healing",      name: "Non-healing Wound / Ulcer",       status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 23: ENVIRONMENTAL / OCCUPATIONAL (6 complaints)
// ═══════════════════════════════════════════════════════════════════════════════
const ENVIRONMENTAL = [
  { slug: "heat_exhaustion",        name: "Heat Exhaustion / Heat Stroke",   status: "❌", priority: "P1", critical: true },
  { slug: "hypothermia_frostbite",  name: "Hypothermia / Frostbite",         status: "❌", priority: "P1", critical: true },
  { slug: "near_drowning",          name: "Near Drowning",                   status: "❌", priority: "P1", critical: true },
  { slug: "lightning_electrical",   name: "Lightning / Electrical Injury",   status: "❌", priority: "P1", critical: true },
  { slug: "altitude_sickness",      name: "Altitude Sickness",               status: "❌", priority: "P2", critical: true },
  { slug: "occupational_exposure",  name: "Occupational Exposure / Hazmat",  status: "❌", priority: "P2", critical: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

export const ALL_SYSTEMS = {
  CARDIOVASCULAR, RESPIRATORY, GASTROINTESTINAL, GENITOURINARY,
  MUSCULOSKELETAL, DERMATOLOGY, NEUROLOGY, ENT, OPHTHALMOLOGY,
  ENDOCRINE, INFECTIOUS, SEXUAL_HEALTH, PSYCHIATRIC, TOXICOLOGY,
  TRAUMA, GYNECOLOGY, PEDIATRIC, ALLERGY, DENTAL, HEMATOLOGY,
  GENERAL, VASCULAR, ENVIRONMENTAL,
};

const allComplaints = Object.values(ALL_SYSTEMS).flat();
const total          = allComplaints.length;
const complete       = allComplaints.filter(c => c.status === "✅").length;
const partial        = allComplaints.filter(c => c.status === "🟡").length;
const missing        = allComplaints.filter(c => c.status === "❌").length;
const critical       = allComplaints.filter(c => c.critical).length;
const criticalMissing = allComplaints.filter(c => c.critical && c.status === "❌").length;
const p1Missing      = allComplaints.filter(c => c.priority === "P1" && c.status !== "✅").length;

export const MASTER_SUMMARY = {
  totalComplaints:    total,          // ~230
  complete:           complete,       // 2 (chest_pain, sore_throat full)
  partial:            partial,        // ~20 (ontology+canary, no LR tables)
  missing:            missing,        // ~200+
  critical:           critical,       // life-threatening if missed
  criticalMissing:    criticalMissing,
  p1Missing:          p1Missing,      // highest priority gaps

  // The Google Sheets migration is the fastest path to coverage
  // Each sheet row = one pathway element
  // Priority: build LR tables + workup + treatment for P1 pathways first
};

/**
 * GOOGLE SHEETS → AURALYN MIGRATION ARCHITECTURE
 *
 * Your Google Sheets structure likely has columns for:
 * - Complaint name
 * - Common diagnoses (differential)
 * - Red flag symptoms
 * - Questions to ask
 * - Physical exam findings
 * - Labs/tests to order
 * - Treatments (medications, doses)
 * - Disposition criteria
 * - Return precautions
 *
 * MIGRATION STEPS:
 *
 * Step 1: Export sheets to CSV
 *   Each system = one sheet = one CSV file
 *
 * Step 2: Run the sheet parser (build as Win 21)
 *   server/clinical/sheetMigrator.ts
 *   Takes CSV → generates ComplaintPathway objects
 *   Validates each with validatePathway()
 *   Outputs: pathways that pass + list of gaps
 *
 * Step 3: Review gaps with physician
 *   Any pathway scoring <80 on validatePathway() needs manual completion
 *   You review clinically, not the developer
 *
 * Step 4: Generate LR tables from clinical references
 *   For each diagnosis in each pathway, extract LR values from:
 *   - Centor, HEART, Wells, Ottawa, PERC, etc. (structured decision rules)
 *   - Deeks & Altman 2004 systematic review of diagnostic LRs
 *   This is a clinical task, not a coding task
 *
 * Step 5: Run drift canary generator
 *   For each pathway, generate 1-2 canonical test cases
 *   Add to driftCheck.ts DRIFT_CANARIES array
 *
 * ESTIMATED TIME:
 *   With your Google Sheets as the source, and a systematic process:
 *   ~30 minutes per pathway × 230 pathways = ~115 hours clinical review
 *   This is the work that makes Auralyn clinically defensible.
 *   No amount of engineering replaces this clinical judgment.
 */
