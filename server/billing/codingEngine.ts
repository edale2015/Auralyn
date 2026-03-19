const ICD10_MAP: Record<string, string> = {
  "ACS": "I20.0",
  "Acute Coronary Syndrome": "I20.0",
  "Myocardial Infarction": "I21.9",
  "Pneumonia": "J18.9",
  "Community-Acquired Pneumonia": "J18.9",
  "Migraine": "G43.909",
  "Tension Headache": "G44.209",
  "Cluster Headache": "G44.009",
  "Sore Throat": "J02.9",
  "Streptococcal Pharyngitis": "J02.0",
  "Urinary Tract Infection": "N39.0",
  "Cellulitis": "L03.90",
  "Appendicitis": "K35.80",
  "Deep Vein Thrombosis": "I82.40",
  "Pulmonary Embolism": "I26.99",
  "Stroke": "I63.9",
  "Asthma Exacerbation": "J45.901",
  "COPD Exacerbation": "J44.1",
  "Atrial Fibrillation": "I48.91",
  "Chest Pain": "R07.9",
  "Abdominal Pain": "R10.9",
  "Back Pain": "M54.5",
  "Ankle Sprain": "S93.401A",
  "Fracture": "T14.8XXA",
  "Laceration": "T14.8XXA",
  "Allergic Reaction": "T78.40XA",
  "Anaphylaxis": "T78.2XXA",
  "Seizure": "R56.9",
  "Syncope": "R55",
  "Vertigo": "H81.10",
  "Otitis Media": "H66.90",
  "Sinusitis": "J01.90",
  "Conjunctivitis": "H10.9",
  "Gastroenteritis": "K52.9",
  "GERD": "K21.0",
  "Depression": "F32.9",
  "Anxiety": "F41.9",
  "Alcohol Withdrawal": "F10.239",
};

const CPT_MAP: Record<string, { code: string; description: string }> = {
  "telemed": { code: "99443", description: "Telehealth E/M 40-54 min" },
  "telemed_brief": { code: "99441", description: "Telehealth E/M 5-10 min" },
  "emergency": { code: "99285", description: "ED Visit — High complexity" },
  "ER": { code: "99284", description: "ED Visit — Moderate-high complexity" },
  "urgent": { code: "99284", description: "ED Visit — Moderate-high complexity" },
  "routine": { code: "99213", description: "Office Visit — Low complexity" },
  "routine_new": { code: "99203", description: "New Patient — Low complexity" },
  "complex": { code: "99215", description: "Office Visit — High complexity" },
};

const ICD10_LOOKUP = new Map<string, string>();
for (const [key, val] of Object.entries(ICD10_MAP)) {
  ICD10_LOOKUP.set(key.toLowerCase().trim(), val);
}

const CPT_LOOKUP = new Map<string, { code: string; description: string }>();
for (const [key, val] of Object.entries(CPT_MAP)) {
  CPT_LOOKUP.set(key.toLowerCase().trim(), val);
}

export function mapToICD10(diagnosis: string): string {
  return ICD10_MAP[diagnosis] || ICD10_LOOKUP.get(diagnosis.toLowerCase().trim()) || "R69";
}

export function mapToCPT(visitType: string): { code: string; description: string } {
  return CPT_MAP[visitType] || CPT_LOOKUP.get(visitType.toLowerCase().trim()) || CPT_MAP["routine"];
}

export function mapToBilling(diagnosis: string, visitType: string) {
  return {
    icd10: mapToICD10(diagnosis),
    cpt: mapToCPT(visitType),
    diagnosis,
    visitType,
  };
}

export function getICD10Catalog(): Record<string, string> {
  return { ...ICD10_MAP };
}
