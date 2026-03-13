import { extractDiagnosticEvidence } from "./diagnosticEvidenceService"
import {
  computeDiagnosisProbability,
  normalizeProbabilities,
} from "./diagnosticProbabilityAggregator"
import { DIAGNOSTIC_MODELS } from "./diagnosticConfidenceModel"

export interface ConfidenceResult {
  diagnosis: string
  probability: number
  ruleScore: number
  similarityScore: number
  confidence: number
  explanation: string[]
}

const COMPLAINT_DEFAULT_DX: Record<string, string[]> = {
  chest_pain: ["acs", "pericarditis", "pulmonary_embolism", "gerd", "musculoskeletal"],
  cough: ["pneumonia", "viral_uri", "bronchitis"],
  sore_throat: ["strep_pharyngitis", "viral_uri", "peritonsillar_abscess"],
  headache: ["tension_headache", "migraine", "meningitis", "subarachnoid_hemorrhage"],
  abdominal_pain: ["appendicitis", "uti", "viral_gastroenteritis"],
  fever: ["viral_uri", "pneumonia", "uti", "meningitis"],
  uti: ["uti", "viral_uri"],
}

function getDefaultDifferential(state: any): any[] {
  const complaint = state.complaint ?? "unknown"
  const defaults = COMPLAINT_DEFAULT_DX[complaint] ?? Object.keys(DIAGNOSTIC_MODELS).slice(0, 5)
  return defaults.map((dx) => ({ diagnosis: dx, score: 0.25, similarityScore: 0 }))
}

export function computeDiagnosticConfidence(state: any): ConfidenceResult[] {
  const evidence = extractDiagnosticEvidence(state)
  const rawDiff: any[] = state.differential ?? []
  const differential = rawDiff.length > 0 ? rawDiff : getDefaultDifferential(state)

  const raw = differential.map((d) => {
    const diagnosis = typeof d === "string" ? d : d.diagnosis ?? "unknown"
    const ruleScore = typeof d === "string" ? 0.3 : d.score ?? d.probability ?? 0.3
    const similarityScore = d.similarityScore ?? 0
    const probability = computeDiagnosisProbability(diagnosis, evidence)

    const confidence = ruleScore * 0.45 + similarityScore * 0.25 + probability * 0.30

    const explanation: string[] = []
    if (evidence.fever) explanation.push("fever present")
    if (evidence.chestPain) explanation.push("chest pain")
    if (evidence.shortnessBreath) explanation.push("dyspnea")
    if (evidence.neckStiffness) explanation.push("neck stiffness")
    if (evidence.trismus) explanation.push("trismus")
    if (evidence.thunderclap) explanation.push("thunderclap onset")
    if (evidence.diaphoresis) explanation.push("diaphoresis")
    if (evidence.radiation) explanation.push("radiation")

    return { diagnosis, probability, ruleScore, similarityScore, confidence, explanation }
  })

  const normalized = normalizeProbabilities(
    raw.map((r) => ({ diagnosis: r.diagnosis, probability: r.probability }))
  )

  return raw
    .map((r, i) => ({ ...r, probability: normalized[i]?.probability ?? r.probability }))
    .sort((a, b) => b.confidence - a.confidence)
}
