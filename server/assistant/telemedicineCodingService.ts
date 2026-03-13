export interface ClinicalCode {
  code: string;
  description: string;
  type: "ICD-10" | "CPT";
  rvu?: number;
  category?: string;
}

const ICD10_MAP: Record<string, Record<string, ClinicalCode[]>> = {
  sore_throat: {
    default:     [{ code: "J02.9", description: "Acute pharyngitis, unspecified", type: "ICD-10" }],
    Prescription:[{ code: "J02.0", description: "Streptococcal pharyngitis", type: "ICD-10" }],
    "Home Care": [{ code: "J02.9", description: "Acute pharyngitis, unspecified (viral)", type: "ICD-10" }],
  },
  cough: {
    default:     [{ code: "R05.9", description: "Cough, unspecified", type: "ICD-10" }],
    "Home Care": [{ code: "R05.9", description: "Cough, unspecified", type: "ICD-10" }],
    Prescription:[{ code: "J06.9", description: "Acute upper respiratory infection, unspecified", type: "ICD-10" }],
    "Urgent Care":[{ code: "J18.9", description: "Pneumonia, unspecified organism", type: "ICD-10" }],
  },
  uti: {
    default:     [{ code: "N39.0", description: "Urinary tract infection, site not specified", type: "ICD-10" }],
    Prescription:[{ code: "N39.0", description: "Urinary tract infection, site not specified", type: "ICD-10" }],
    "Urgent Care":[{ code: "N10", description: "Acute pyelonephritis", type: "ICD-10" }],
  },
  ear_pain: {
    default:     [{ code: "H66.9", description: "Otitis media, unspecified", type: "ICD-10" }],
    Prescription:[{ code: "H66.003", description: "Acute suppurative otitis media, bilateral", type: "ICD-10" }],
    "Home Care": [{ code: "H92.09", description: "Otalgia, unspecified", type: "ICD-10" }],
  },
  fever: {
    default:     [{ code: "R50.9", description: "Fever, unspecified", type: "ICD-10" }],
    "Home Care": [{ code: "R50.9", description: "Fever, unspecified", type: "ICD-10" }],
    "Urgent Care":[{ code: "A49.9", description: "Bacterial infection, unspecified", type: "ICD-10" }],
  },
  rash: {
    default:     [{ code: "R21", description: "Rash and other nonspecific skin eruption", type: "ICD-10" }],
    "Home Care": [{ code: "L23.9", description: "Allergic contact dermatitis, unspecified cause", type: "ICD-10" }],
    "Urgent Care":[{ code: "L03.90", description: "Cellulitis, unspecified", type: "ICD-10" }],
  },
  sinus_pressure: {
    default:     [{ code: "J01.90", description: "Acute sinusitis, unspecified", type: "ICD-10" }],
    "Home Care": [{ code: "J06.9", description: "Acute upper respiratory infection, unspecified", type: "ICD-10" }],
    Prescription:[{ code: "J01.00", description: "Acute maxillary sinusitis, unspecified", type: "ICD-10" }],
  },
  chest_pain: {
    default:     [{ code: "R07.9", description: "Chest pain, unspecified", type: "ICD-10" }],
    ED:          [{ code: "I21.9", description: "Acute myocardial infarction, unspecified (rule out)", type: "ICD-10" }, { code: "I26.99", description: "Other pulmonary embolism (rule out)", type: "ICD-10" }],
    "Urgent Care":[{ code: "R07.1", description: "Chest pain on breathing (pleuritic)", type: "ICD-10" }],
  },
  abdominal_pain: {
    default:     [{ code: "R10.9", description: "Unspecified abdominal pain", type: "ICD-10" }],
    ED:          [{ code: "K37", description: "Unspecified appendicitis (rule out)", type: "ICD-10" }],
    "Urgent Care":[{ code: "R10.84", description: "Generalized abdominal pain", type: "ICD-10" }],
    "Home Care": [{ code: "K59.1", description: "Functional diarrhea / gastroenteritis", type: "ICD-10" }],
  },
};

const CPT_MAP: Record<string, ClinicalCode[]> = {
  telehealth_new: [
    { code: "99203", description: "Office visit — new patient, low complexity (telemedicine)", type: "CPT", rvu: 1.60, category: "E&M" },
    { code: "99204", description: "Office visit — new patient, moderate complexity (telemedicine)", type: "CPT", rvu: 2.60, category: "E&M" },
  ],
  telehealth_established: [
    { code: "99213", description: "Office visit — established patient, low complexity (telemedicine)", type: "CPT", rvu: 1.30, category: "E&M" },
    { code: "99214", description: "Office visit — established patient, moderate complexity (telemedicine)", type: "CPT", rvu: 1.92, category: "E&M" },
  ],
  telemedicine_modifier: [
    { code: "95", description: "Modifier: synchronous telemedicine service (patient not present in same location)", type: "CPT", category: "Modifier" },
  ],
  procedure_strep: [
    { code: "87880", description: "Rapid Streptococcus A antigen test", type: "CPT", rvu: 0.0, category: "Lab" },
  ],
  procedure_ua: [
    { code: "81001", description: "Urinalysis, automated, with microscopy", type: "CPT", rvu: 0.0, category: "Lab" },
  ],
};

function getCptForComplaint(complaint: string): ClinicalCode[] {
  const codes: ClinicalCode[] = [...CPT_MAP.telehealth_established, ...CPT_MAP.telemedicine_modifier];
  if (complaint === "sore_throat") codes.push(...CPT_MAP.procedure_strep);
  if (complaint === "uti") codes.push(...CPT_MAP.procedure_ua);
  return codes;
}

export function generateClinicalCodes(complaint: string, disposition: string): { icd10: ClinicalCode[]; cpt: ClinicalCode[] } {
  const complaintMap = ICD10_MAP[complaint] ?? {};
  const icd10 = complaintMap[disposition] ?? complaintMap["default"] ?? [{ code: "Z09", description: "Encounter for follow-up examination", type: "ICD-10" }];
  const cpt = getCptForComplaint(complaint);
  return { icd10, cpt };
}
