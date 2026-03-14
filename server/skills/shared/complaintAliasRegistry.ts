export type ComplaintAliasGroup = {
  canonical: string;
  aliases: string[];
};

const GROUPS: ComplaintAliasGroup[] = [
  // ENT
  { canonical: "sore_throat", aliases: ["sore_throat", "ent_sore_throat", "throat_pain", "pharyngitis", "tonsillitis"] },
  { canonical: "ear_pain", aliases: ["ear_pain", "ent_ear_pain", "otalgia", "otitis_media", "otitis_externa", "ear_infection"] },
  { canonical: "sinus_pressure", aliases: ["sinus_pressure", "ent_sinus_pressure", "sinusitis", "sinusitis_acute", "nasal_sinus_pain"] },
  { canonical: "hoarseness", aliases: ["hoarseness", "laryngitis", "voice_change", "dysphonia"] },
  { canonical: "epistaxis", aliases: ["epistaxis", "nosebleed", "nasal_bleeding", "epistaxis_recurrent"] },
  { canonical: "nasal_congestion", aliases: ["nasal_congestion", "stuffy_nose", "rhinorrhea"] },
  { canonical: "tinnitus", aliases: ["tinnitus", "ringing_ears", "ear_ringing"] },
  { canonical: "hearing_loss", aliases: ["hearing_loss", "hearing_change", "sudden_hearing_loss"] },
  { canonical: "stridor", aliases: ["stridor", "noisy_breathing", "inspiratory_stridor"] },
  { canonical: "neck_mass", aliases: ["neck_mass", "neck_lump", "lymphadenopathy", "neck_swelling", "parotid_swelling"] },
  { canonical: "peritonsillar_abscess", aliases: ["peritonsillar_abscess", "pta", "quinsy", "peritonsil_abscess"] },
  { canonical: "foreign_body_ear", aliases: ["foreign_body_ear", "ear_foreign_body"] },
  { canonical: "foreign_body_nose", aliases: ["foreign_body_nose", "nasal_foreign_body"] },
  { canonical: "vertigo", aliases: ["vertigo", "dizziness_vertigo", "bppv", "inner_ear_vertigo"] },

  // Pulmonary / Respiratory
  { canonical: "cough", aliases: ["cough", "pulm_cough", "resp_cough", "chronic_cough", "productive_cough"] },
  { canonical: "shortness_of_breath", aliases: ["shortness_of_breath", "dyspnea", "sob", "breathlessness", "respiratory_distress"] },
  { canonical: "wheezing", aliases: ["wheezing", "bronchospasm", "audible_wheeze"] },
  { canonical: "asthma_exacerbation", aliases: ["asthma_exacerbation", "asthma_attack", "asthma_flare"] },
  { canonical: "copd_exacerbation", aliases: ["copd_exacerbation", "copd_flare", "chronic_bronchitis_exacerbation"] },
  { canonical: "pneumonia", aliases: ["pneumonia", "lung_infection", "community_acquired_pneumonia", "cap"] },
  { canonical: "bronchitis", aliases: ["bronchitis", "acute_bronchitis", "chest_cold"] },
  { canonical: "hemoptysis", aliases: ["hemoptysis", "coughing_blood", "blood_in_sputum"] },
  { canonical: "pleurisy", aliases: ["pleurisy", "pleuritic_chest_pain", "pleuritis"] },
  { canonical: "hypoxia", aliases: ["hypoxia", "low_oxygen", "oxygen_desaturation"] },
  { canonical: "sleep_disordered_breathing", aliases: ["sleep_disordered_breathing", "sleep_apnea", "osa_concern"] },

  // Cardiac
  { canonical: "chest_pain", aliases: ["chest_pain", "cardiac_chest_pain", "chest_tightness", "angina"] },
  { canonical: "palpitations", aliases: ["palpitations", "heart_racing", "irregular_heartbeat", "tachycardia", "arrhythmia"] },
  { canonical: "syncope", aliases: ["syncope", "fainting", "loss_of_consciousness", "blackout"] },
  { canonical: "atrial_fibrillation", aliases: ["atrial_fibrillation", "afib", "af", "a_fib"] },
  { canonical: "hypertensive_urgency", aliases: ["hypertensive_urgency", "high_blood_pressure", "hypertensive_emergency", "hypertension_emergency"] },
  { canonical: "decompensated_heart_failure", aliases: ["decompensated_heart_failure", "chf_exacerbation", "heart_failure_exacerbation", "acute_heart_failure"] },
  { canonical: "leg_swelling", aliases: ["leg_swelling", "bilateral_edema", "lower_extremity_swelling", "pedal_edema"] },
  { canonical: "bradycardia", aliases: ["bradycardia", "slow_heart_rate", "heart_rate_low"] },

  // GI / Abdominal
  { canonical: "abdominal_pain", aliases: ["abdominal_pain", "gi_abdominal_pain", "abd_pain", "stomach_pain", "belly_pain"] },
  { canonical: "nausea_vomiting", aliases: ["nausea_vomiting", "nausea", "vomiting", "emesis", "n_v"] },
  { canonical: "diarrhea", aliases: ["diarrhea", "loose_stools", "gi_diarrhea", "watery_stool"] },
  { canonical: "constipation", aliases: ["constipation", "no_bowel_movement", "obstipation"] },
  { canonical: "dysphagia", aliases: ["dysphagia", "difficulty_swallowing", "odynophagia"] },
  { canonical: "jaundice", aliases: ["jaundice", "yellow_skin", "icterus", "yellow_eyes"] },
  { canonical: "gi_bleeding", aliases: ["gi_bleeding", "gastrointestinal_bleeding", "melena", "hematemesis", "blood_in_stool"] },
  { canonical: "rectal_bleeding", aliases: ["rectal_bleeding", "bright_red_blood_rectum", "hematochezia", "rectal_blood"] },
  { canonical: "appendicitis_like", aliases: ["appendicitis_like", "right_lower_quadrant_pain", "rlq_pain", "appendix_pain"] },
  { canonical: "cholecystitis_like", aliases: ["cholecystitis_like", "gallbladder_pain", "right_upper_quadrant_pain", "ruq_pain"] },
  { canonical: "pancreatitis_like", aliases: ["pancreatitis_like", "pancreatic_pain", "epigastric_radiating_back"] },
  { canonical: "bowel_obstruction", aliases: ["bowel_obstruction", "intestinal_obstruction", "sbo"] },
  { canonical: "gerd_esophageal", aliases: ["gerd_esophageal", "gerd", "heartburn", "acid_reflux", "esophageal_pain"] },

  // GU / Renal
  { canonical: "uti", aliases: ["uti", "gu_uti_symptoms", "gu_dysuria_uti", "dysuria", "urinary_tract_infection", "uti_symptoms"] },
  { canonical: "hematuria", aliases: ["hematuria", "blood_in_urine", "urinary_bleeding"] },
  { canonical: "flank_pain", aliases: ["flank_pain", "kidney_pain", "renal_colic", "nephrolithiasis", "kidney_stone"] },
  { canonical: "urinary_retention", aliases: ["urinary_retention", "unable_to_urinate", "urinary_obstruction"] },
  { canonical: "testicular_pain", aliases: ["testicular_pain", "scrotal_pain", "orchitis", "epididymitis", "testicular_torsion_concern"] },
  { canonical: "vaginal_bleeding", aliases: ["vaginal_bleeding", "abnormal_uterine_bleeding", "menorrhagia", "postmenopausal_bleeding"] },
  { canonical: "pelvic_pain", aliases: ["pelvic_pain", "lower_pelvic_pain", "pelvic_inflammatory_disease", "pid"] },
  { canonical: "pelvic_pain_ovarian_torsion", aliases: ["pelvic_pain_ovarian_torsion", "ovarian_torsion", "adnexal_torsion"] },
  { canonical: "sti_exposure", aliases: ["sti_exposure", "std_exposure", "sexual_transmitted_infection", "vaginal_discharge", "urethral_discharge"] },
  { canonical: "ectopic_pregnancy_concern", aliases: ["ectopic_pregnancy_concern", "ectopic_pregnancy", "tubal_pregnancy"] },
  { canonical: "urinary_incontinence", aliases: ["urinary_incontinence", "bladder_leakage", "urinary_urgency"] },
  { canonical: "prostatitis", aliases: ["prostatitis", "prostate_pain", "prostate_infection"] },

  // Neurology
  { canonical: "headache", aliases: ["headache", "head_pain", "cephalgia", "migraine", "tension_headache", "cluster_headache"] },
  { canonical: "headache_thunderclap", aliases: ["headache_thunderclap", "thunderclap_headache", "worst_headache_of_life"] },
  { canonical: "dizziness", aliases: ["dizziness", "lightheadedness", "presyncope", "near_syncope"] },
  { canonical: "weakness_numbness", aliases: ["weakness_numbness", "focal_weakness", "numbness_tingling", "paresthesia", "limb_weakness"] },
  { canonical: "confusion", aliases: ["confusion", "altered_mental_status", "ams", "delirium", "altered_consciousness"] },
  { canonical: "seizure", aliases: ["seizure", "convulsion", "epileptic_seizure", "seizure_post_ictal", "post_ictal"] },
  { canonical: "stroke_like", aliases: ["stroke_like", "stroke", "cva", "tia_like", "tia", "transient_ischemic_attack"] },
  { canonical: "vision_loss", aliases: ["vision_loss", "vision_loss_acute", "visual_disturbance", "visual_field_loss", "amaurosis"] },
  { canonical: "facial_droop", aliases: ["facial_droop", "facial_weakness", "bells_palsy", "facial_palsy"] },
  { canonical: "tremor", aliases: ["tremor", "shaking", "involuntary_movement"] },
  { canonical: "ataxia", aliases: ["ataxia", "balance_problems", "gait_unsteadiness", "incoordination"] },
  { canonical: "meningitis_concern", aliases: ["meningitis_concern", "neck_stiffness_fever", "meningismus", "meningitis"] },
  { canonical: "diplopia", aliases: ["diplopia", "double_vision", "binocular_diplopia"] },

  // Musculoskeletal
  { canonical: "back_pain", aliases: ["back_pain", "low_back_pain", "lbp", "lumbar_pain", "back_strain"] },
  { canonical: "joint_pain", aliases: ["joint_pain", "arthralgia", "polyarthralgia", "joint_ache"] },
  { canonical: "shoulder_pain", aliases: ["shoulder_pain", "rotator_cuff_pain", "shoulder_injury"] },
  { canonical: "knee_pain", aliases: ["knee_pain", "knee_injury", "knee_swelling"] },
  { canonical: "ankle_sprain", aliases: ["ankle_sprain", "ankle_injury", "sprain_injury", "ankle_pain"] },
  { canonical: "neck_pain", aliases: ["neck_pain", "cervical_pain", "cervicalgia", "neck_stiffness"] },
  { canonical: "hip_pain", aliases: ["hip_pain", "hip_injury", "hip_fracture_concern"] },
  { canonical: "fracture_dislocation", aliases: ["fracture_dislocation", "fracture", "broken_bone", "dislocation", "suspected_fracture"] },
  { canonical: "gout_flare", aliases: ["gout_flare", "gout", "gouty_arthritis", "podagra"] },
  { canonical: "muscle_weakness", aliases: ["muscle_weakness", "myasthenia_concern", "proximal_weakness", "limb_weakness_bilateral"] },
  { canonical: "compartment_syndrome_concern", aliases: ["compartment_syndrome_concern", "compartment_syndrome", "tight_cast_pain"] },
  { canonical: "wrist_pain", aliases: ["wrist_pain", "wrist_injury", "carpal_tunnel"] },

  // Dermatology
  { canonical: "rash", aliases: ["rash", "derm_rash", "skin_rash", "exanthem"] },
  { canonical: "cellulitis", aliases: ["cellulitis", "skin_infection", "erythema_warmth_skin"] },
  { canonical: "abscess_skin", aliases: ["abscess_skin", "skin_abscess", "furuncle", "boil", "carbuncle"] },
  { canonical: "urticaria", aliases: ["urticaria", "hives", "allergic_skin_rash", "angioedema"] },
  { canonical: "shingles", aliases: ["shingles", "herpes_zoster", "zoster_rash", "dermatomal_rash"] },
  { canonical: "burns", aliases: ["burns", "thermal_burn", "chemical_burn", "skin_burn"] },
  { canonical: "wound_infection", aliases: ["wound_infection", "infected_wound", "wound_dehiscence"] },
  { canonical: "laceration", aliases: ["laceration", "cut", "skin_laceration", "wound"] },
  { canonical: "insect_bite_reaction", aliases: ["insect_bite_reaction", "bug_bite", "insect_sting", "bee_sting"] },
  { canonical: "pressure_ulcer", aliases: ["pressure_ulcer", "decubitus_ulcer", "bed_sore", "stage_3_wound"] },

  // Psychiatric / Behavioral
  { canonical: "anxiety", aliases: ["anxiety", "anxiety_disorder", "generalized_anxiety", "acute_anxiety"] },
  { canonical: "depression", aliases: ["depression", "major_depressive_episode", "mood_disorder", "depressed_mood"] },
  { canonical: "suicidal_ideation", aliases: ["suicidal_ideation", "si", "suicidal_thoughts", "self_harm"] },
  { canonical: "agitation_psychosis", aliases: ["agitation_psychosis", "psychosis", "agitation", "acute_psychosis", "mania", "bipolar_episode"] },
  { canonical: "panic_attack", aliases: ["panic_attack", "panic_disorder", "acute_panic"] },
  { canonical: "substance_intoxication", aliases: ["substance_intoxication", "drug_intoxication", "opioid_intoxication", "alcohol_intoxication"] },
  { canonical: "withdrawal", aliases: ["withdrawal", "alcohol_withdrawal", "opioid_withdrawal", "benzodiazepine_withdrawal", "drug_withdrawal"] },

  // Endocrine / Metabolic
  { canonical: "hyperglycemia", aliases: ["hyperglycemia", "high_blood_sugar", "diabetic_emergency", "diabetic_ketoacidosis", "dka"] },
  { canonical: "hypoglycemia", aliases: ["hypoglycemia", "low_blood_sugar", "glucose_low"] },
  { canonical: "thyroid_symptoms", aliases: ["thyroid_symptoms", "thyrotoxicosis", "hyperthyroidism", "hypothyroidism", "thyroid_crisis"] },
  { canonical: "adrenal_crisis", aliases: ["adrenal_crisis", "addisonian_crisis", "adrenal_insufficiency"] },
  { canonical: "metabolic_derangement", aliases: ["metabolic_derangement", "hyponatremia", "hyperkalemia", "hypokalemia", "hypercalcemia", "electrolyte_imbalance"] },

  // Infections / Systemic
  { canonical: "fever", aliases: ["fever", "general_fever", "pyrexia", "high_temperature", "febrile"] },
  { canonical: "flu_like", aliases: ["flu_like", "influenza_like", "flu", "influenza", "viral_illness"] },
  { canonical: "sepsis_concern", aliases: ["sepsis_concern", "sepsis", "septic_shock", "systemic_infection"] },
  { canonical: "covid_like", aliases: ["covid_like", "covid_19", "sars_cov_2", "corona_symptoms"] },
  { canonical: "mononucleosis", aliases: ["mononucleosis", "mono", "ebv_infection", "glandular_fever"] },
  { canonical: "lyme_concern", aliases: ["lyme_concern", "lyme_disease", "tick_borne_illness", "tick_bite"] },
  { canonical: "animal_bite", aliases: ["animal_bite", "dog_bite", "cat_bite", "bite_wound", "animal_scratch"] },

  // Trauma / Environmental
  { canonical: "head_injury", aliases: ["head_injury", "head_trauma", "traumatic_brain_injury", "tbi", "concussion"] },
  { canonical: "facial_trauma", aliases: ["facial_trauma", "face_injury", "facial_fracture"] },
  { canonical: "eye_pain", aliases: ["eye_pain", "eye_pain_acute", "eye_discomfort"] },
  { canonical: "eye_trauma", aliases: ["eye_trauma", "eye_injury", "chemical_eye_injury", "corneal_abrasion"] },
  { canonical: "pelvic_fracture", aliases: ["pelvic_fracture", "hip_fracture", "pubic_rami_fracture"] },
  { canonical: "penetrating_wound", aliases: ["penetrating_wound", "stab_wound", "gunshot_wound", "puncture_wound"] },
  { canonical: "overdose_intoxication", aliases: ["overdose_intoxication", "overdose", "drug_overdose", "accidental_overdose"] },
  { canonical: "poisoning_exposure", aliases: ["poisoning_exposure", "toxic_ingestion", "chemical_exposure", "carbon_monoxide_exposure", "co_poisoning"] },
  { canonical: "heat_illness", aliases: ["heat_illness", "heat_stroke", "heat_exhaustion", "hyperthermia"] },
  { canonical: "hypothermia_cold_exposure", aliases: ["hypothermia_cold_exposure", "hypothermia", "frostbite", "cold_injury"] },
  { canonical: "allergic_reaction", aliases: ["allergic_reaction", "allergy", "anaphylaxis", "anaphylactic_reaction"] },

  // Ophthalmology
  { canonical: "red_eye", aliases: ["red_eye", "conjunctivitis", "pink_eye", "eye_redness"] },
  { canonical: "acute_glaucoma", aliases: ["acute_glaucoma", "angle_closure_glaucoma", "eye_pressure_pain", "iritis_uveitis"] },

  // OB / GYN
  { canonical: "pregnancy_complication", aliases: ["pregnancy_complication", "obstetric_emergency", "preterm_labor", "preeclampsia_concern", "eclampsia", "placenta_previa_concern", "hyperemesis_gravidarum"] },
  { canonical: "postpartum_complication", aliases: ["postpartum_complication", "postpartum_hemorrhage", "postpartum_infection"] },

  // General / Constitutional
  { canonical: "fatigue", aliases: ["fatigue", "extreme_fatigue", "lethargy", "weakness_fatigue", "tiredness"] },
  { canonical: "generalized_weakness", aliases: ["generalized_weakness", "nausea_malaise", "malaise", "not_feeling_well", "general_unwellness"] },
  { canonical: "insomnia", aliases: ["insomnia", "sleep_disturbance", "inability_to_sleep"] },
  { canonical: "dental_pain", aliases: ["dental_pain", "toothache", "tooth_pain", "dental_abscess"] },
  { canonical: "foreign_body_ingestion", aliases: ["foreign_body_ingestion", "swallowed_object", "esophageal_foreign_body"] },
  { canonical: "cancer_related_symptom", aliases: ["cancer_related_symptom", "oncologic_emergency", "tumor_pain", "chemo_complication"] },
];

const aliasToCanonical = new Map<string, string>();
for (const group of GROUPS) {
  for (const alias of group.aliases) {
    aliasToCanonical.set(alias.toLowerCase(), group.canonical);
  }
}

export function canonicalizeComplaintId(input?: string): string {
  if (!input) return "";
  const normalized = input.trim().toLowerCase();
  return aliasToCanonical.get(normalized) ?? normalized;
}

export function getComplaintAliases(input?: string): string[] {
  const canonical = canonicalizeComplaintId(input);
  const group = GROUPS.find((g) => g.canonical === canonical);
  return group ? group.aliases : canonical ? [canonical] : [];
}

export function complaintIdsMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return canonicalizeComplaintId(a) === canonicalizeComplaintId(b);
}

export function getAllCanonicalComplaints(): string[] {
  return GROUPS.map((g) => g.canonical);
}
