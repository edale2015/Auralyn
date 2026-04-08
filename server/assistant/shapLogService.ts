import type { ShapExplanation } from "./shapExplainer"

export interface ShapLogEntry {
  caseId: string
  iteration: number
  ts: number
  explanation: ShapExplanation
  triage: string
  safetyGovernorOverride: boolean
}

const shapLog: ShapLogEntry[] = []
const MAX = 50

export function logShap(entry: ShapLogEntry): void {
  shapLog.push(entry)
  if (shapLog.length > MAX) shapLog.shift()
}

export function getShapHistory(limit = 20): ShapLogEntry[] {
  return shapLog.slice(-limit)
}

export function getShapForCase(caseId: string): ShapLogEntry[] {
  return shapLog.filter(e => e.caseId === caseId)
}
