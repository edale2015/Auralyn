import * as fs from "fs/promises"
import * as path from "path"

const FILE = path.resolve(
  process.cwd(),
  "server/data/runtime/outcome_case_memory.ndjson"
)

export interface OutcomeCaseRecord {
  caseId: string
  complaint: string
  symptoms: string
  disposition: string
  differential: string[]
  questionsAsked: string[]
  actualDiagnosis?: string
  topPredictionMatch?: boolean
  dispositionMatch?: boolean
  safetyMiss?: boolean
  physicianCorrection?: string
  patientAgeGroup?: string
  patientSex?: string
  timestamp: string
}

export async function loadOutcomeMemory(): Promise<OutcomeCaseRecord[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8")
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

export async function appendOutcomeRecord(record: OutcomeCaseRecord): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.appendFile(FILE, JSON.stringify(record) + "\n")
}

export async function saveOutcomeMemory(rows: OutcomeCaseRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.writeFile(FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
}

export async function getOutcomeStats(): Promise<Record<string, any>> {
  const rows = await loadOutcomeMemory()
  const byDx: Record<string, number> = {}
  let topPredictionMatches = 0
  let dispositionMatches = 0
  let safetyMisses = 0

  for (const r of rows) {
    const dx = r.actualDiagnosis ?? r.differential?.[0] ?? "unknown"
    byDx[dx] = (byDx[dx] ?? 0) + 1
    if (r.topPredictionMatch) topPredictionMatches++
    if (r.dispositionMatch) dispositionMatches++
    if (r.safetyMiss) safetyMisses++
  }

  return {
    total: rows.length,
    byDiagnosis: byDx,
    topPredictionAccuracy: rows.length ? topPredictionMatches / rows.length : 0,
    dispositionAccuracy: rows.length ? dispositionMatches / rows.length : 0,
    safetyMissRate: rows.length ? safetyMisses / rows.length : 0,
  }
}
