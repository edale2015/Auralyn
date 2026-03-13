export interface RiskFactor {
  key: string;
  label: string;
  description: string;
  weight: number;
  category: "symptom" | "demographic" | "comorbidity" | "vitals" | "social";
}

export const ADMISSION_RISK_FACTORS: Record<string, RiskFactor[]> = {
  chest_pain: [
    { key: "radiation_arm_jaw", label: "Arm/jaw radiation", description: "Pain radiating to arm or jaw", weight: 0.3, category: "symptom" },
    { key: "sob", label: "Shortness of breath", description: "Concurrent dyspnea", weight: 0.25, category: "symptom" },
    { key: "diaphoresis", label: "Diaphoresis", description: "Sweating with chest pain", weight: 0.2, category: "symptom" },
    { key: "prior_mi", label: "Prior MI or CAD", description: "History of coronary artery disease", weight: 0.25, category: "comorbidity" },
    { key: "diabetes", label: "Diabetes", description: "DM1 or DM2", weight: 0.1, category: "comorbidity" },
    { key: "hypertension", label: "Hypertension", description: "HTN on medication", weight: 0.1, category: "comorbidity" },
    { key: "age_65", label: "Age ≥65", description: "Advanced age increases ACS risk", weight: 0.15, category: "demographic" },
    { key: "elevated_troponin", label: "Elevated troponin", description: "Any troponin elevation", weight: 0.4, category: "vitals" },
  ],
  cough: [
    { key: "fever_3d", label: "Fever >3 days", description: "Prolonged fever suggests bacterial infection", weight: 0.2, category: "symptom" },
    { key: "productive_purulent", label: "Purulent sputum", description: "Green/yellow thick sputum", weight: 0.15, category: "symptom" },
    { key: "sob_at_rest", label: "SOB at rest", description: "Dyspnea at rest", weight: 0.35, category: "symptom" },
    { key: "age_65", label: "Age ≥65", description: "Higher pneumonia risk", weight: 0.15, category: "demographic" },
    { key: "immunocompromised", label: "Immunocompromised", description: "HIV, chemotherapy, steroids", weight: 0.25, category: "comorbidity" },
    { key: "copd_asthma", label: "COPD or Asthma", description: "Underlying lung disease", weight: 0.2, category: "comorbidity" },
    { key: "o2_sat_low", label: "O2 sat <94%", description: "Hypoxia on room air", weight: 0.4, category: "vitals" },
  ],
  uti: [
    { key: "fever_chills", label: "Fever with chills", description: "Systemic signs — pyelonephritis risk", weight: 0.35, category: "symptom" },
    { key: "flank_pain", label: "Flank/CVA pain", description: "Upper tract involvement", weight: 0.3, category: "symptom" },
    { key: "pregnancy", label: "Pregnancy", description: "Complicated UTI by definition", weight: 0.4, category: "comorbidity" },
    { key: "diabetes", label: "Diabetes", description: "Increased risk of complicated UTI", weight: 0.2, category: "comorbidity" },
    { key: "structural_abnormality", label: "Structural abnormality", description: "Kidney stones, indwelling catheter", weight: 0.25, category: "comorbidity" },
    { key: "male_sex", label: "Male sex", description: "UTI in males is always complicated", weight: 0.3, category: "demographic" },
  ],
  fever: [
    { key: "high_fever_104", label: "Temp ≥104°F", description: "High-grade fever", weight: 0.25, category: "vitals" },
    { key: "stiff_neck", label: "Stiff neck", description: "Meningismus", weight: 0.45, category: "symptom" },
    { key: "rash", label: "Rash with fever", description: "Petechiae or purpura with fever", weight: 0.45, category: "symptom" },
    { key: "altered_mental", label: "Altered mental status", description: "Confusion, lethargy", weight: 0.4, category: "symptom" },
    { key: "immunocompromised", label: "Immunocompromised", description: "HIV, chemotherapy, steroids", weight: 0.35, category: "comorbidity" },
    { key: "hr_120", label: "HR >120", description: "Tachycardia — sepsis screening", weight: 0.3, category: "vitals" },
  ],
  abdominal_pain: [
    { key: "rebound_tenderness", label: "Rebound tenderness", description: "Peritoneal signs", weight: 0.45, category: "symptom" },
    { key: "high_fever", label: "Fever >101°F", description: "Systemic infection", weight: 0.25, category: "symptom" },
    { key: "rigidity", label: "Abdominal rigidity", description: "Board-like abdomen — peritonitis", weight: 0.45, category: "symptom" },
    { key: "pregnancy_hcg", label: "Positive HCG", description: "Ectopic pregnancy risk", weight: 0.5, category: "comorbidity" },
    { key: "severe_pain_10_10", label: "Severe pain (9–10/10)", description: "Maximal severity", weight: 0.3, category: "symptom" },
    { key: "vomiting_inability", label: "Unable to tolerate fluids", description: "Obstruction or ileus", weight: 0.3, category: "symptom" },
  ],
};

export const DETERIORATION_RISK_FACTORS: Record<string, RiskFactor[]> = {
  chest_pain: [
    { key: "stemi_ecg", label: "STEMI on ECG", description: "ST elevation — immediate STEMI protocol", weight: 1.0, category: "vitals" },
    { key: "hypotension", label: "SBP <90mmHg", description: "Hemodynamic instability", weight: 0.8, category: "vitals" },
    { key: "rapid_troponin_rise", label: "Troponin rising", description: "Serial troponin increase", weight: 0.6, category: "vitals" },
    { key: "vt_vf", label: "VT/VF on monitor", description: "Malignant arrhythmia", weight: 1.0, category: "vitals" },
  ],
  fever: [
    { key: "sbp_drop", label: "SBP <100mmHg", description: "Septic shock developing", weight: 0.8, category: "vitals" },
    { key: "rr_30", label: "RR ≥30/min", description: "Respiratory compromise", weight: 0.6, category: "vitals" },
    { key: "gcs_drop", label: "GCS decreasing", description: "Neurological deterioration", weight: 0.8, category: "vitals" },
    { key: "lactate_high", label: "Lactate >2.0", description: "Tissue hypoperfusion — sepsis", weight: 0.7, category: "vitals" },
  ],
};

export function getAdmissionRiskFactors(complaint: string): RiskFactor[] {
  return ADMISSION_RISK_FACTORS[complaint] ?? [];
}

export function getDeteriorationRiskFactors(complaint: string): RiskFactor[] {
  return DETERIORATION_RISK_FACTORS[complaint] ?? [];
}
