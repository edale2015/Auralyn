export interface ProcedureStep {
  step: string;
  tool?: string;
  position?: string;
  labTest?: string;
  condition?: string;
  medication?: string;
  notes?: string;
  timeoutMs?: number;
}

export const strepWorkflow: ProcedureStep[] = [
  {
    step: "assess_symptoms",
    notes: "Centor score ≥ 2 required to proceed",
  },
  {
    step: "swab_throat",
    tool: "swab",
    position: "posterior_pharynx",
    notes: "Swab both tonsils and posterior pharynx",
    timeoutMs: 5000,
  },
  {
    step: "run_rapid_test",
    labTest: "strep_radt",
    notes: "Rapid antigen detection test — result in 5–10 min",
    timeoutMs: 600000,
  },
  {
    step: "start_antibiotics_if_positive",
    condition: "rapid_test === positive",
    medication: "amoxicillin_500mg_tid_10days",
    notes: "First-line: Amoxicillin 500mg TID x10d. Penicillin allergy: Azithromycin",
  },
  {
    step: "culture_if_negative_but_high_centor",
    condition: "rapid_test === negative AND centor >= 3",
    labTest: "throat_culture",
    notes: "Send throat culture for definitive diagnosis if high clinical suspicion",
  },
  {
    step: "document_and_discharge",
    notes: "Document Centor score, test result, treatment plan, return precautions",
  },
];

export const earInfectionWorkflow: ProcedureStep[] = [
  { step: "otoscope_exam", tool: "otoscope", position: "ear_canal" },
  { step: "assess_tympanic_membrane" },
  { step: "start_antibiotics_if_indicated", condition: "otitis_media === confirmed", medication: "amoxicillin_80mgkg_10days" },
];

export const sinusitisWorkflow: ProcedureStep[] = [
  { step: "assess_symptoms" },
  { step: "nasal_examination", tool: "nasal_scope", position: "nasal_cavity" },
  { step: "saline_irrigation_if_mild", condition: "severity === mild" },
  { step: "antibiotic_if_bacterial", condition: "duration > 10 AND bacterial_features", medication: "amoxicillin_clavulanate" },
];
