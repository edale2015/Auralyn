import { loadOutcomeMemory } from "./outcomeCaseMemory"
import { saveSimilarityIndex } from "./caseSimilarityStore"

export interface CaseMemoryEntry {
  caseId: string
  complaint: string
  diagnosis?: string
  symptoms: string[]
  disposition: string
  differential: string[]
  ageBucket?: string
  sex?: string
  topPredictionMatch?: boolean
  dispositionMatch?: boolean
  safetyMiss?: boolean
  timestamp: string
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2)
}

export async function buildCaseMemoryIndex(): Promise<CaseMemoryEntry[]> {
  const rows = await loadOutcomeMemory()

  return rows.map((r) => ({
    caseId: r.caseId,
    complaint: r.complaint,
    diagnosis: r.actualDiagnosis ?? r.differential?.[0],
    symptoms: tokenize(r.symptoms ?? ""),
    disposition: r.disposition ?? "unknown",
    differential: r.differential ?? [],
    ageBucket: r.patientAgeGroup,
    sex: r.patientSex,
    topPredictionMatch: r.topPredictionMatch,
    dispositionMatch: r.dispositionMatch,
    safetyMiss: r.safetyMiss,
    timestamp: r.timestamp,
  }))
}

export async function rebuildSimilarityIndexFromOutcomes(): Promise<number> {
  const entries = await buildCaseMemoryIndex()
  if (entries.length > 0) {
    await saveSimilarityIndex(entries as any)
  }
  return entries.length
}
