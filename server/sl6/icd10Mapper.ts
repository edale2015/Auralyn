export interface CodeMapping {
  complaint: string;
  disposition: string;
  icd10: { code: string; description: string }[];
  cpt: { code: string; description: string; rvu: number }[];
  notes: string;
}

const CODE_TABLE: CodeMapping[] = [
  {
    complaint: "cough",
    disposition: "Home Care",
    icd10: [{ code: "R05.9", description: "Cough, unspecified" }, { code: "J06.9", description: "Acute upper respiratory infection, unspecified" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }],
    notes: "Consider URTI if < 3 weeks duration with no red flags",
  },
  {
    complaint: "cough",
    disposition: "Urgent Care",
    icd10: [{ code: "R05.9", description: "Cough, unspecified" }, { code: "J22", description: "Unspecified acute lower respiratory infection" }],
    cpt: [{ code: "99214", description: "Office visit, established patient, moderate complexity", rvu: 2.8 }, { code: "71046", description: "Chest X-ray, 2 views", rvu: 0.57 }],
    notes: "Order CXR if suspected pneumonia",
  },
  {
    complaint: "cough",
    disposition: "ED",
    icd10: [{ code: "R05.9", description: "Cough, unspecified" }, { code: "J18.9", description: "Pneumonia, unspecified organism" }],
    cpt: [{ code: "99285", description: "ED visit, high complexity", rvu: 4.9 }, { code: "71046", description: "Chest X-ray, 2 views", rvu: 0.57 }],
    notes: "Rule out PE; consider CT-PA if PERC positive",
  },
  {
    complaint: "sore_throat",
    disposition: "Home Care",
    icd10: [{ code: "J02.9", description: "Acute pharyngitis, unspecified" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }],
    notes: "Viral pharyngitis, supportive care",
  },
  {
    complaint: "sore_throat",
    disposition: "Prescription",
    icd10: [{ code: "J02.0", description: "Streptococcal pharyngitis" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }, { code: "87880", description: "Strep A antigen test", rvu: 0.19 }],
    notes: "Centor ≥3, treat with amoxicillin 500mg x10d",
  },
  {
    complaint: "uti",
    disposition: "Prescription",
    icd10: [{ code: "N39.0", description: "Urinary tract infection, site not specified" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }, { code: "81003", description: "Urinalysis, automated", rvu: 0.21 }],
    notes: "Uncomplicated UTI — nitrofurantoin 100mg BID x5d or TMP-SMX DS BID x3d",
  },
  {
    complaint: "uti",
    disposition: "Urgent Care",
    icd10: [{ code: "N39.0", description: "Urinary tract infection, site not specified" }, { code: "N11.9", description: "Chronic tubulo-interstitial nephritis, unspecified" }],
    cpt: [{ code: "99214", description: "Office visit, established patient, moderate complexity", rvu: 2.8 }, { code: "81001", description: "Urinalysis, microscopic", rvu: 0.27 }],
    notes: "Consider pyelonephritis if fever/flank pain",
  },
  {
    complaint: "ear_pain",
    disposition: "Prescription",
    icd10: [{ code: "H66.90", description: "Otitis media, unspecified, unspecified ear" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }],
    notes: "AOM — amoxicillin 500mg TID x7d",
  },
  {
    complaint: "fever",
    disposition: "Home Care",
    icd10: [{ code: "R50.9", description: "Fever, unspecified" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }],
    notes: "Viral fever, supportive care",
  },
  {
    complaint: "fever",
    disposition: "ED",
    icd10: [{ code: "R50.9", description: "Fever, unspecified" }, { code: "A41.9", description: "Sepsis, unspecified organism" }],
    cpt: [{ code: "99285", description: "ED visit, high complexity", rvu: 4.9 }, { code: "87046", description: "Culture, stool aerobic", rvu: 0.49 }],
    notes: "Sepsis workup — blood cultures x2, CBC, BMP, lactate",
  },
  {
    complaint: "chest_pain",
    disposition: "ED",
    icd10: [{ code: "R07.9", description: "Chest pain, unspecified" }, { code: "I21.9", description: "Acute myocardial infarction, unspecified" }],
    cpt: [{ code: "99285", description: "ED visit, high complexity", rvu: 4.9 }, { code: "93010", description: "ECG with interpretation", rvu: 0.48 }, { code: "71046", description: "Chest X-ray, 2 views", rvu: 0.57 }],
    notes: "ACS workup — troponin serial, ECG, aspirin 325mg if not contraindicated",
  },
  {
    complaint: "rash",
    disposition: "Urgent Care",
    icd10: [{ code: "R21", description: "Rash and other nonspecific skin eruption" }],
    cpt: [{ code: "99214", description: "Office visit, established patient, moderate complexity", rvu: 2.8 }],
    notes: "Dermatology consult if uncertain; rule out cellulitis vs contact dermatitis",
  },
  {
    complaint: "sinus_pressure",
    disposition: "Home Care",
    icd10: [{ code: "J32.9", description: "Chronic sinusitis, unspecified" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }],
    notes: "Viral rhinosinusitis < 10 days — saline irrigation, decongestants",
  },
  {
    complaint: "sinus_pressure",
    disposition: "Prescription",
    icd10: [{ code: "J01.90", description: "Acute sinusitis, unspecified" }],
    cpt: [{ code: "99213", description: "Office visit, established patient, low complexity", rvu: 1.92 }],
    notes: "Bacterial sinusitis (> 10 days or double-worsening) — amoxicillin-clavulanate x5-7d",
  },
  {
    complaint: "abdominal_pain",
    disposition: "ED",
    icd10: [{ code: "R10.9", description: "Unspecified abdominal pain" }, { code: "K35.80", description: "Other and unspecified acute appendicitis" }],
    cpt: [{ code: "99285", description: "ED visit, high complexity", rvu: 4.9 }, { code: "74177", description: "CT abdomen/pelvis w/ contrast", rvu: 2.16 }],
    notes: "Rule out appendicitis, AAA, bowel obstruction",
  },
];

export function getCodeTable(): CodeMapping[] {
  return CODE_TABLE;
}

export function mapCodes(complaint: string, disposition: string): CodeMapping | null {
  const key = complaint.toLowerCase().replace(/\s+/g, "_");
  return CODE_TABLE.find(m => m.complaint === key && m.disposition === disposition) ?? null;
}

export function getComplaintsForCoding(): string[] {
  return [...new Set(CODE_TABLE.map(m => m.complaint))];
}

export function getDispositionsForComplaint(complaint: string): string[] {
  return CODE_TABLE.filter(m => m.complaint === complaint).map(m => m.disposition);
}
