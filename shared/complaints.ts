export const COMPLAINTS: string[] = [
  // ENT
  "sore_throat", "ear_pain", "sinus_pressure", "hoarseness", "epistaxis",
  "nasal_congestion", "tinnitus", "hearing_loss", "stridor", "neck_mass",
  "peritonsillar_abscess", "foreign_body_ear", "foreign_body_nose", "vertigo",
  "post_nasal_drip", "anosmia", "dysphonia", "salivary_gland_swelling",
  "eustachian_tube_dysfunction", "mastoiditis_concern", "laryngitis",
  // Pulmonary
  "cough", "shortness_of_breath", "wheezing", "asthma_exacerbation",
  "copd_exacerbation", "pneumonia", "bronchitis", "hemoptysis", "pleurisy",
  "hypoxia", "sleep_disordered_breathing", "pulmonary_embolism_concern",
  "pneumothorax_concern", "pleural_effusion", "respiratory_failure",
  // Cardiac
  "chest_pain", "palpitations", "syncope", "atrial_fibrillation",
  "hypertensive_urgency", "decompensated_heart_failure", "leg_swelling", "bradycardia",
  "tachycardia", "chest_wall_pain", "cardiac_arrest_post", "endocarditis_concern",
  "aortic_stenosis_symptoms", "myocarditis_concern",
  // GI
  "abdominal_pain", "nausea_vomiting", "diarrhea", "constipation", "dysphagia",
  "jaundice", "gi_bleeding", "rectal_bleeding", "appendicitis_like",
  "cholecystitis_like", "pancreatitis_like", "bowel_obstruction", "gerd_esophageal",
  "ascites", "hepatitis_like", "mesenteric_ischemia_concern", "hernia_pain",
  "inflammatory_bowel_flare", "diverticulitis_like", "rectal_prolapse",
  // GU / Renal
  "uti", "hematuria", "flank_pain", "urinary_retention", "testicular_pain",
  "vaginal_bleeding", "pelvic_pain", "pelvic_pain_ovarian_torsion", "sti_exposure",
  "ectopic_pregnancy_concern", "urinary_incontinence", "prostatitis",
  "acute_kidney_injury", "nephrolithiasis", "epididymitis", "hydrocele",
  "vaginal_discharge", "scrotal_swelling",
  // Neurology
  "headache", "headache_thunderclap", "dizziness", "weakness_numbness", "confusion",
  "seizure", "stroke_like", "vision_loss", "facial_droop", "tremor", "ataxia",
  "meningitis_concern", "diplopia", "neuropathy_symptoms", "encephalopathy_concern",
  "pseudotumor_cerebri", "bells_palsy", "trigeminal_neuralgia", "transient_global_amnesia",
  "cauda_equina_concern", "spinal_cord_compression",
  // MSK
  "back_pain", "joint_pain", "shoulder_pain", "knee_pain", "ankle_sprain",
  "neck_pain", "hip_pain", "fracture_dislocation", "gout_flare",
  "muscle_weakness", "compartment_syndrome_concern", "wrist_pain",
  "elbow_pain", "hand_pain", "foot_pain", "achilles_tendon_injury",
  "septic_arthritis_concern", "osteomyelitis_concern", "rhabdomyolysis_concern",
  "fibromyalgia_flare", "costochondritis",
  // Dermatology
  "rash", "cellulitis", "abscess_skin", "urticaria", "shingles", "burns",
  "wound_infection", "laceration", "insect_bite_reaction", "pressure_ulcer",
  "contact_dermatitis", "eczema_flare", "psoriasis_flare", "petechia_purpura",
  "necrotizing_fasciitis_concern", "pilonidal_cyst", "paronychia",
  // Psychiatric / Behavioral
  "anxiety", "depression", "suicidal_ideation", "agitation_psychosis", "panic_attack",
  "substance_intoxication", "withdrawal", "bipolar_episode", "ptsd_symptoms",
  "acute_stress_reaction", "eating_disorder_crisis", "self_harm",
  // Endocrine / Metabolic
  "hyperglycemia", "hypoglycemia", "thyroid_symptoms", "adrenal_crisis",
  "metabolic_derangement", "hypercalcemia", "hyponatremia", "hyperkalemia",
  "cushing_symptoms", "addisonian_crisis", "hyperthyroidism_crisis",
  // Infections / Systemic
  "fever", "flu_like", "sepsis_concern", "covid_like", "mononucleosis",
  "lyme_concern", "animal_bite", "hiv_concern", "tuberculosis_concern",
  "mrsa_infection", "influenza", "cellulitis_strep", "meningococcal_concern",
  "rabies_exposure", "tick_borne_illness",
  // Trauma / Environmental
  "head_injury", "facial_trauma", "eye_pain", "eye_trauma", "pelvic_fracture",
  "penetrating_wound", "overdose_intoxication", "poisoning_exposure",
  "heat_illness", "hypothermia_cold_exposure", "allergic_reaction",
  "near_drowning", "electrical_injury", "blast_injury", "crush_injury",
  "chemical_exposure", "carbon_monoxide_exposure",
  // Ophthalmology
  "red_eye", "acute_glaucoma", "corneal_abrasion", "uveitis", "retinal_detachment_concern",
  "subconjunctival_hemorrhage", "periorbital_cellulitis", "chemical_eye_exposure",
  "visual_field_defect", "optic_neuritis",
  // OB / GYN
  "pregnancy_complication", "postpartum_complication", "hyperemesis_gravidarum",
  "preeclampsia_concern", "placenta_previa_concern", "preterm_labor_concern",
  "mastitis", "ovarian_cyst_rupture", "endometriosis_pain", "menorrhagia",
  // General
  "fatigue", "generalized_weakness", "insomnia", "dental_pain",
  "foreign_body_ingestion", "cancer_related_symptom", "unintentional_weight_loss",
  "lymphadenopathy", "night_sweats", "chronic_pain_crisis",
  // Vascular
  "deep_vein_thrombosis", "aortic_dissection_concern", "peripheral_arterial_disease",
  "limb_ischemia_acute", "variceal_bleeding_concern", "superior_vena_cava_syndrome",
  // Pediatric
  "croup", "febrile_seizure", "kawasaki_concern", "intussusception_concern",
  "epiglottitis_concern", "rsv_bronchiolitis", "neonatal_jaundice",
  "pediatric_foreign_body", "failure_to_thrive", "child_abuse_concern",
  // Hematology / Oncology
  "bleeding_disorder", "sickle_cell_crisis", "neutropenic_fever",
  "oncologic_emergency", "tumor_lysis_syndrome", "anemia_symptomatic",
  "thrombocytopenia", "hemolysis_concern",
  // Toxicology
  "opioid_overdose", "benzodiazepine_overdose", "acetaminophen_overdose",
  "stimulant_toxicity", "anticholinergic_toxidrome", "organophosphate_exposure",
].sort();

export const COMPLAINTS_SET = new Set(COMPLAINTS);
