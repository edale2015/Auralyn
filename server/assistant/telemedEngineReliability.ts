export interface EngineSnapshot {
  engine: string
  calls: number
  failures: number
  failureRate: number
  avgLatencyMs: number
  p50Ms: number
  p95Ms: number
  minMs: number
  maxMs: number
  lastCalledAt: number
  status: "healthy" | "degraded" | "critical" | "idle"
}

interface EngineRecord {
  engine: string
  calls: number
  failures: number
  latencies: number[]
  lastCalledAt: number
}

const WINDOW = 100
const records = new Map<string, EngineRecord>()

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

export function trackEngine(engine: string, latencyMs: number, failed: boolean): void {
  let rec = records.get(engine)
  if (!rec) {
    rec = { engine, calls: 0, failures: 0, latencies: [], lastCalledAt: 0 }
    records.set(engine, rec)
  }
  rec.calls++
  if (failed) rec.failures++
  rec.latencies.push(latencyMs)
  if (rec.latencies.length > WINDOW) rec.latencies.shift()
  rec.lastCalledAt = Date.now()
}

export async function timeEngine<T>(engine: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  let failed = false
  try {
    const result = await fn()
    return result
  } catch (err) {
    failed = true
    throw err
  } finally {
    trackEngine(engine, Date.now() - start, failed)
  }
}

export function timeEngineSync<T>(engine: string, fn: () => T): T {
  const start = Date.now()
  let failed = false
  try {
    const result = fn()
    return result
  } catch (err) {
    failed = true
    throw err
  } finally {
    trackEngine(engine, Date.now() - start, failed)
  }
}

export function getEngineReliability(): EngineSnapshot[] {
  return [...records.values()].map(rec => {
    const sorted = [...rec.latencies].sort((a, b) => a - b)
    const failureRate = rec.calls > 0 ? rec.failures / rec.calls : 0
    const avgLatencyMs = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0
    const p50Ms = percentile(sorted, 50)
    const p95Ms = percentile(sorted, 95)
    const minMs = sorted[0] ?? 0
    const maxMs = sorted[sorted.length - 1] ?? 0

    const status: EngineSnapshot["status"] =
      failureRate >= 0.5 ? "critical" :
      failureRate >= 0.2 ? "degraded" :
      rec.calls === 0 ? "idle" : "healthy"

    return {
      engine: rec.engine,
      calls: rec.calls,
      failures: rec.failures,
      failureRate: Math.round(failureRate * 1000) / 1000,
      avgLatencyMs: Math.round(avgLatencyMs),
      p50Ms: Math.round(p50Ms),
      p95Ms: Math.round(p95Ms),
      minMs: Math.round(minMs),
      maxMs: Math.round(maxMs),
      lastCalledAt: rec.lastCalledAt,
      status,
    }
  }).sort((a, b) => b.calls - a.calls)
}

export function getEngineHealth(): { healthy: number; degraded: number; critical: number; total: number } {
  const all = getEngineReliability()
  return {
    healthy: all.filter(e => e.status === "healthy").length,
    degraded: all.filter(e => e.status === "degraded").length,
    critical: all.filter(e => e.status === "critical").length,
    total: all.length,
  }
}
