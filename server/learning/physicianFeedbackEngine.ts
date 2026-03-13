import * as fs from "fs/promises"
import * as path from "path"

const FILE = path.resolve(
  process.cwd(),
  "server/data/runtime/physician_feedback.ndjson"
)

export interface PhysicianFeedback {
  caseId: string
  systemDiagnosis: string
  systemDisposition: string
  correctedDiagnosis?: string
  correctedDisposition?: string
  physicianNote?: string
  approved: boolean
  timestamp: string
}

export async function recordPhysicianFeedback(data: Omit<PhysicianFeedback, "timestamp">): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  const record: PhysicianFeedback = {
    ...data,
    timestamp: new Date().toISOString(),
  }
  await fs.appendFile(FILE, JSON.stringify(record) + "\n")
}

export async function loadPhysicianFeedback(): Promise<PhysicianFeedback[]> {
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

export async function getPhysicianFeedbackStats(): Promise<Record<string, any>> {
  const rows = await loadPhysicianFeedback()
  const corrections: Record<string, number> = {}
  let approvals = 0

  for (const r of rows) {
    if (r.approved) {
      approvals++
    } else if (r.correctedDiagnosis) {
      const key = `${r.systemDiagnosis}→${r.correctedDiagnosis}`
      corrections[key] = (corrections[key] ?? 0) + 1
    }
  }

  const approvalRate = rows.length ? approvals / rows.length : 0
  const topCorrections = Object.entries(corrections)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([pair, count]) => ({ pair, count }))

  return {
    total: rows.length,
    approvals,
    approvalRate,
    topCorrections,
  }
}

export async function getDiagnosisCorrectionMap(): Promise<Record<string, string>> {
  const rows = await loadPhysicianFeedback()
  const map: Record<string, string> = {}
  const counts: Record<string, Record<string, number>> = {}

  for (const r of rows) {
    if (r.correctedDiagnosis && r.systemDiagnosis) {
      counts[r.systemDiagnosis] ??= {}
      counts[r.systemDiagnosis][r.correctedDiagnosis] =
        (counts[r.systemDiagnosis][r.correctedDiagnosis] ?? 0) + 1
    }
  }

  for (const [sys, corrections] of Object.entries(counts)) {
    const top = Object.entries(corrections).sort(([, a], [, b]) => b - a)[0]
    if (top) map[sys] = top[0]
  }

  return map
}
