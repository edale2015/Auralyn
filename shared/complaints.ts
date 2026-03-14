export const COMPLAINTS: string[] = [
  // ENT
  "sore_throat", "ear_pain", "sinus_pressure", "hoarseness", "epistaxis",
  "nasal_congestion", "tinnitus", "hearing_loss", "stridor", "neck_mass",
  "peritonsillar_abscess", "foreign_body_ear", "foreign_body_nose", "vertigo",
  // Pulmonary
  "cough", "shortness_of_breath", "wheezing", "asthma_exacerbation",
  "copd_exacerbation", "pneumonia", "bronchitis", "hemoptysis", "pleurisy",
  "hypoxia", "sleep_disordered_breathing",
  // Cardiac
  "chest_pain", "palpitations", "syncope", "atrial_fibrillation",
  "hypertensive_urgency", "decompensated_heart_failure", "leg_swelling", "bradycardia",
  // GI
  "abdominal_pain", "nausea_vomiting", "diarrhea", "constipation", "dysphagia",
  "jaundice", "gi_bleeding", "rectal_bleeding", "appendicitis_like",
  "cholecystitis_like", "pancreatitis_like", "bowel_obstruction", "gerd_esophageal",
  // GU / Renal
  "uti", "hematuria", "flank_pain", "urinary_retention", "testicular_pain",
  "vaginal_bleeding", "pelvic_pain", "pelvic_pain_ovarian_torsion", "sti_exposure",
  "ectopic_pregnancy_concern", "urinary_incontinence", "prostatitis",
  // Neurology
  "headache", "headache_thunderclap", "dizziness", "weakness_numbness", "confusion",
  "seizure", "stroke_like", "vision_loss", "facial_droop", "tremor", "ataxia",
  "meningitis_concern", "diplopia",
  // MSK
  "back_pain", "joint_pain", "shoulder_pain", "knee_pain", "ankle_sprain",
  "neck_pain", "hip_pain", "fracture_dislocation", "gout_flare",
  "muscle_weakness", "compartment_syndrome_concern", "wrist_pain",
  // Dermatology
  "rash", "cellulitis", "abscess_skin", "urticaria", "shingles", "burns",
  "wound_infection", "laceration", "insect_bite_reaction", "pressure_ulcer",
  // Psychiatric / Behavioral
  "anxiety", "depression", "suicidal_ideation", "agitation_psychosis", "panic_attack",
  "substance_intoxication", "withdrawal",
  // Endocrine / Metabolic
  "hyperglycemia", "hypoglycemia", "thyroid_symptoms", "adrenal_crisis",
  "metabolic_derangement",
  // Infections / Systemic
  "fever", "flu_like", "sepsis_concern", "covid_like", "mononucleosis",
  "lyme_concern", "animal_bite",
  // Trauma / Environmental
  "head_injury", "facial_trauma", "eye_pain", "eye_trauma", "pelvic_fracture",
  "penetrating_wound", "overdose_intoxication", "poisoning_exposure",
  "heat_illness", "hypothermia_cold_exposure", "allergic_reaction",
  // Ophthalmology
  "red_eye", "acute_glaucoma",
  // OB / GYN
  "pregnancy_complication", "postpartum_complication",
  // General
  "fatigue", "generalized_weakness", "insomnia", "dental_pain",
  "foreign_body_ingestion", "cancer_related_symptom",
  // Vascular
  "deep_vein_thrombosis", "aortic_dissection_concern", "peripheral_arterial_disease",
  // Pediatric
  "croup", "febrile_seizure", "kawasaki_concern", "intussusception_concern",
  // Hematology / Oncology
  "bleeding_disorder", "sickle_cell_crisis", "neutropenic_fever",
].sort();

export const COMPLAINTS_SET = new Set(COMPLAINTS);
