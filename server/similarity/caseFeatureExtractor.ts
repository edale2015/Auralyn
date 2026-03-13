export interface CaseFeatures {
  caseId: string
  complaint: string
  symptoms: string[]
  alerts: string[]
  disposition: string
  differential: string[]
  ageBucket?: string
  sex?: string
}

const KNOWN_PHRASES = [
  "fever", "cough", "sore throat", "shortness of breath", "chest pain",
  "abdominal pain", "headache", "neck stiffness", "burning urination",
  "back pain", "rash", "ear pain", "difficulty swallowing", "vomiting",
  "diarrhea", "fatigue", "congestion", "sinus pressure", "white patches",
  "swollen glands", "nausea", "wheezing", "dizziness", "palpitations",
  "diaphoresis", "hematuria", "dysuria", "frequency", "edema",
  "confusion", "altered mental status", "photophobia", "phonophobia",
  "night sweats", "weight loss", "hemoptysis", "bloody stool",
  "radiation arm", "jaw pain", "pleuritic", "trismus", "rigors",
  "worst headache", "thunderclap", "drooling", "leg swelling",
]

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_")
}

function extractSymptomTokens(symptomsText: string): string[] {
  if (!symptomsText) return []
  const lower = symptomsText.toLowerCase()
  return KNOWN_PHRASES
    .filter(p => lower.includes(p))
    .map(normalizeText)
}

function toAgeBucket(age?: number): string | undefined {
  if (age == null) return undefined
  if (age < 2) return "infant"
  if (age < 12) return "child"
  if (age < 18) return "adolescent"
  if (age < 50) return "adult"
  if (age < 65) return "older_adult"
  return "elderly"
}

export function extractCaseFeatures(state: any): CaseFeatures {
  const patient = state.patient ?? {}
  const differential = (state.differential ?? []).map((d: any) =>
    typeof d === "string" ? d : (d.diagnosis ?? "")
  ).filter(Boolean)

  return {
    caseId: state.caseId,
    complaint: state.complaint ?? "unknown",
    symptoms: extractSymptomTokens(state.symptoms ?? ""),
    alerts: (state.alerts ?? []).map((a: any) =>
      normalizeText(typeof a === "string" ? a : JSON.stringify(a))
    ),
    disposition: normalizeText(state.disposition ?? "unknown"),
    differential: differential.filter(Boolean).map(normalizeText),
    ageBucket: toAgeBucket(patient.age),
    sex: patient.sex ? normalizeText(patient.sex) : undefined,
  }
}
