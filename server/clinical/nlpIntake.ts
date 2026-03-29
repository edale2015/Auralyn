import { normalizeDiagnosis, ONTOLOGY_CONCEPTS } from "../ontology/diagnosisOntology";

export interface NLPIntakeResult {
  rawText: string;
  normalizedCode: string | null;
  normalizedLabel: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  method: "exact_synonym" | "keyword_match" | "fallback";
  unmapped: boolean;
}

const KEYWORD_MAP: Array<{ keywords: string[]; icd10: string }> = [
  { keywords: ["sore throat", "throat pain", "pharyngitis", "tonsil"],          icd10: "J02.0" },
  { keywords: ["cough", "dry cough", "wet cough", "productive cough"],           icd10: "R05"   },
  { keywords: ["chest pain", "chest tightness", "chest pressure"],               icd10: "R07.9" },
  { keywords: ["shortness of breath", "difficulty breathing", "dyspnea", "sob"], icd10: "R06.0" },
  { keywords: ["fever", "high temperature", "febrile"],                          icd10: "R50.9" },
  { keywords: ["ear pain", "ear ache", "ear infection", "otalgia"],              icd10: "H66.90"},
  { keywords: ["headache", "head pain", "migraine"],                             icd10: "R51"   },
  { keywords: ["back pain", "low back pain", "lumbar pain"],                     icd10: "M54.5" },
  { keywords: ["runny nose", "nasal congestion", "stuffy nose", "rhinorrhea"],   icd10: "J00"   },
  { keywords: ["fatigue", "tired", "exhaustion", "weakness"],                    icd10: "R53.83"},
  { keywords: ["nausea", "vomiting", "upset stomach"],                           icd10: "R11.2" },
  { keywords: ["rash", "skin rash", "hives", "urticaria"],                       icd10: "R21"   },
  { keywords: ["uti", "urinary pain", "burning urination", "frequent urination"],icd10: "N39.0" },
  { keywords: ["ankle swelling", "leg swelling", "edema", "swollen legs"],       icd10: "R60.9" },
  { keywords: ["dizziness", "dizzy", "vertigo", "lightheaded"],                  icd10: "R42"   },
];

let totalNormalized = 0;
let totalUnmapped   = 0;

export function normalizeChiefComplaint(text: string): NLPIntakeResult {
  const lower = text.toLowerCase().trim();
  totalNormalized++;

  const direct = normalizeDiagnosis(lower);
  if (direct) {
    return {
      rawText: text, normalizedCode: direct.id, normalizedLabel: direct.label,
      confidence: "HIGH", method: "exact_synonym", unmapped: false,
    };
  }

  for (const entry of KEYWORD_MAP) {
    const hit = entry.keywords.find((kw) => lower.includes(kw));
    if (hit) {
      const concept = normalizeDiagnosis(entry.icd10) ?? { label: entry.icd10 };
      return {
        rawText: text, normalizedCode: entry.icd10,
        normalizedLabel: "label" in concept ? concept.label : entry.icd10,
        confidence: lower.trim() === hit ? "HIGH" : "MEDIUM",
        method: "keyword_match", unmapped: false,
      };
    }
  }

  totalUnmapped++;
  return {
    rawText: text, normalizedCode: null, normalizedLabel: null,
    confidence: "LOW", method: "fallback", unmapped: true,
  };
}

export function structuredIntake(input: {
  freeText?: string;
  complaint?: string;
  symptoms?: string[];
  [key: string]: any;
}) {
  const text = input.freeText ?? input.complaint ?? "";
  const nlp  = normalizeChiefComplaint(text);

  const symptomCodes = (input.symptoms ?? []).map((s) => ({
    raw: s, ...normalizeChiefComplaint(s),
  }));

  return {
    ...input,
    complaintCode:    nlp.normalizedCode ?? "UNKNOWN",
    complaintLabel:   nlp.normalizedLabel,
    nlpResult:        nlp,
    symptomCodes,
  };
}

export function getNLPIntakeStats() {
  return {
    active: true,
    totalNormalized,
    totalUnmapped,
    mappedRate: totalNormalized > 0
      ? +((1 - totalUnmapped / totalNormalized) * 100).toFixed(1)
      : 100,
    keywordRules:   KEYWORD_MAP.length,
    ontologyConcepts: ONTOLOGY_CONCEPTS.length,
  };
}
