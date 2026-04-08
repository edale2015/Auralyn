export type SpecialtyCouncil =
  | "cardiology"
  | "pulmonary"
  | "infectious_disease"
  | "ent"
  | "neurology"
  | "gastroenterology"
  | "general";

export interface SpecialtyRoutingResult {
  primary: SpecialtyCouncil;
  secondary: SpecialtyCouncil | null;
  confidence: number;
  reason: string;
}

export function routeToSpecialtyCouncil(complaint: string, differential?: any[]): SpecialtyRoutingResult {
  const c = (complaint ?? "").toLowerCase();
  const topDx = ((differential?.[0]?.diagnosis) ?? "").toLowerCase();
  const combined = `${c} ${topDx}`;

  if (/chest pain|chest pressure|palpitation|cardiac|heart attack|acs|stemi|angina/.test(combined)) {
    return { primary: "cardiology", secondary: "pulmonary", confidence: 0.90, reason: "Chest/cardiac complaint pattern" };
  }
  if (/sob|shortness of breath|dyspnea|wheez|asthma|copd|pneumonia|pulmonary embol/.test(combined)) {
    return { primary: "pulmonary", secondary: "cardiology", confidence: 0.85, reason: "Respiratory complaint pattern" };
  }
  if (/fever|infection|sepsis|meningit|encephal|abscess|cellulitis|uti|pneumonia|covid|influenza/.test(combined)) {
    return { primary: "infectious_disease", secondary: null, confidence: 0.85, reason: "Infectious/febrile illness pattern" };
  }
  if (/sore throat|ear pain|otitis|sinusitis|rhinitis|tonsil|pharyngit|laryngitis|nasal/.test(combined)) {
    return { primary: "ent", secondary: "infectious_disease", confidence: 0.82, reason: "ENT complaint pattern" };
  }
  if (/headache|migraine|seizure|stroke|tia|neuro|dizziness|vertigo|syncope/.test(combined)) {
    return { primary: "neurology", secondary: null, confidence: 0.80, reason: "Neurological complaint pattern" };
  }
  if (/abdominal|nausea|vomit|diarrhea|gi bleed|bowel|hepat|gastro|appendic/.test(combined)) {
    return { primary: "gastroenterology", secondary: null, confidence: 0.78, reason: "GI complaint pattern" };
  }

  return { primary: "general", secondary: null, confidence: 0.60, reason: "No specialty-specific pattern matched" };
}
