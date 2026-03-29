export interface DiagnosisConcept {
  id: string;
  system: "ICD-10" | "SNOMED-CT";
  label: string;
  synonyms: string[];
  hccCode?: string;
  severity: "minor" | "moderate" | "serious" | "critical";
}

const ONTOLOGY: DiagnosisConcept[] = [
  { id: "J00",   system: "ICD-10", label: "Upper respiratory infection",        synonyms: ["uri", "common cold", "cold", "upper respiratory", "urti"],                          severity: "minor" },
  { id: "J02.0", system: "ICD-10", label: "Streptococcal pharyngitis",           synonyms: ["strep throat", "streptococcal pharyngitis", "strep pharyngitis", "bacterial pharyngitis"], severity: "moderate" },
  { id: "J11.1", system: "ICD-10", label: "Influenza",                           synonyms: ["flu", "influenza a", "influenza b", "seasonal flu"],                              severity: "moderate" },
  { id: "J18.9", system: "ICD-10", label: "Pneumonia",                           synonyms: ["pneumonia", "cap", "community acquired pneumonia", "lung infection"],              severity: "serious" },
  { id: "J06.9", system: "ICD-10", label: "Acute upper respiratory infection",   synonyms: ["acute uri", "acute respiratory infection", "ari"],                                severity: "minor" },
  { id: "I26.9", system: "ICD-10", label: "Pulmonary embolism",                  synonyms: ["pe", "pulmonary embolism", "lung clot", "pulmonary thromboembolism"],             severity: "critical" },
  { id: "R65.20",system: "ICD-10", label: "Severe sepsis",                       synonyms: ["sepsis", "severe sepsis", "septicemia"],                                          hccCode: "HCC2", severity: "critical" },
  { id: "E11.9", system: "ICD-10", label: "Type 2 diabetes mellitus",            synonyms: ["diabetes", "t2dm", "type 2 diabetes", "dm2"],                                    hccCode: "HCC19", severity: "moderate" },
  { id: "I50.9", system: "ICD-10", label: "Heart failure",                       synonyms: ["chf", "congestive heart failure", "heart failure", "hf"],                        hccCode: "HCC85", severity: "serious" },
  { id: "J44.1", system: "ICD-10", label: "COPD with acute exacerbation",        synonyms: ["copd", "copd exacerbation", "chronic obstructive pulmonary disease"],             hccCode: "HCC111", severity: "serious" },
  { id: "N39.0", system: "ICD-10", label: "Urinary tract infection",             synonyms: ["uti", "urinary tract infection", "bladder infection", "cystitis"],               severity: "moderate" },
  { id: "H66.90",system: "ICD-10", label: "Otitis media",                        synonyms: ["ear infection", "otitis media", "middle ear infection", "om"],                   severity: "minor" },
  { id: "J06.0", system: "ICD-10", label: "Acute laryngopharyngitis",            synonyms: ["sore throat", "pharyngitis", "throat infection", "tonsillitis"],                 severity: "minor" },
  { id: "R51",   system: "ICD-10", label: "Headache",                            synonyms: ["headache", "migraine", "tension headache", "cephalalgia"],                      severity: "minor" },
  { id: "M54.5", system: "ICD-10", label: "Low back pain",                       synonyms: ["back pain", "low back pain", "lumbago", "lumbar pain"],                         severity: "minor" },
];

export function normalizeDiagnosis(input: string): DiagnosisConcept | null {
  const lower = input.toLowerCase().trim();
  return (
    ONTOLOGY.find(
      (d) =>
        d.id.toLowerCase() === lower ||
        d.label.toLowerCase() === lower ||
        d.synonyms.includes(lower),
    ) ?? null
  );
}

export function getDiagnosisById(id: string): DiagnosisConcept | null {
  return ONTOLOGY.find((d) => d.id === id) ?? null;
}

export function getOntologyStats() {
  return {
    active: true,
    conceptCount: ONTOLOGY.length,
    systems: ["ICD-10", "SNOMED-CT"],
    hccLinked: ONTOLOGY.filter((d) => d.hccCode).length,
    severityDistribution: {
      minor:    ONTOLOGY.filter((d) => d.severity === "minor").length,
      moderate: ONTOLOGY.filter((d) => d.severity === "moderate").length,
      serious:  ONTOLOGY.filter((d) => d.severity === "serious").length,
      critical: ONTOLOGY.filter((d) => d.severity === "critical").length,
    },
  };
}

export const ONTOLOGY_CONCEPTS = ONTOLOGY;
