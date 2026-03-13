import * as fs from "fs/promises"
import * as path from "path"

interface MetricsSnapshot {
  visits: number
  alerts: number
  erDispositions: number
  urgentCareDispositions: number
  routineDispositions: number
  homeCareDispositions: number
  followUpQuestions: number
  carePathwaysExecuted: number
  similaritiesComputed: number
  workerErrors: number
  avgConfidence: number
  confidenceSamples: number
  lastReset: string
  uptimeSince: string
}

const metrics: MetricsSnapshot = {
  visits: 0,
  alerts: 0,
  erDispositions: 0,
  urgentCareDispositions: 0,
  routineDispositions: 0,
  homeCareDispositions: 0,
  followUpQuestions: 0,
  carePathwaysExecuted: 0,
  similaritiesComputed: 0,
  workerErrors: 0,
  avgConfidence: 0,
  confidenceSamples: 0,
  lastReset: new Date().toISOString(),
  uptimeSince: new Date().toISOString(),
}

const METRICS_FILE = path.join(process.cwd(), "data", "runtime", "metrics.json")

export function recordVisit(): void { metrics.visits++ }
export function recordAlert(): void { metrics.alerts++ }
export function recordWorkerError(): void { metrics.workerErrors++ }
export function recordFollowUpQuestion(): void { metrics.followUpQuestions++ }
export function recordCarePathway(): void { metrics.carePathwaysExecuted++ }
export function recordSimilarityComputed(): void { metrics.similaritiesComputed++ }

export function recordDisposition(disposition: string): void {
  if (disposition === "er_now") metrics.erDispositions++
  else if (disposition === "urgent_care") metrics.urgentCareDispositions++
  else if (disposition === "routine") metrics.routineDispositions++
  else if (disposition === "home_care") metrics.homeCareDispositions++
}

export function recordConfidence(confidence: number): void {
  metrics.confidenceSamples++
  metrics.avgConfidence =
    (metrics.avgConfidence * (metrics.confidenceSamples - 1) + confidence) /
    metrics.confidenceSamples
}

export function getMetrics(): MetricsSnapshot & { uptimeSeconds: number } {
  return {
    ...metrics,
    avgConfidence: Number(metrics.avgConfidence.toFixed(3)),
    uptimeSeconds: Math.floor(
      (Date.now() - new Date(metrics.uptimeSince).getTime()) / 1000
    ),
  }
}

export function resetMetrics(): void {
  metrics.visits = 0
  metrics.alerts = 0
  metrics.erDispositions = 0
  metrics.urgentCareDispositions = 0
  metrics.routineDispositions = 0
  metrics.homeCareDispositions = 0
  metrics.followUpQuestions = 0
  metrics.carePathwaysExecuted = 0
  metrics.similaritiesComputed = 0
  metrics.workerErrors = 0
  metrics.avgConfidence = 0
  metrics.confidenceSamples = 0
  metrics.lastReset = new Date().toISOString()
}

export async function persistMetrics(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(METRICS_FILE), { recursive: true })
    await fs.writeFile(METRICS_FILE, JSON.stringify(getMetrics(), null, 2), "utf8")
  } catch { /* non-fatal */ }
}

setInterval(persistMetrics, 30_000)
