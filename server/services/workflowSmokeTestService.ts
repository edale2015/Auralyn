export type SmokeTestResult = {
  test: string
  ok: boolean
  durationMs: number
  detail: string
}

export async function runWorkflowSmokeTests(): Promise<{ ok: boolean; results: SmokeTestResult[] }> {
  const results: SmokeTestResult[] = []

  results.push(await time("health_endpoint", async () => {
    const res = await fetch("http://localhost:5000/api/health").catch(() => null)
    if (!res?.ok) throw new Error(`Status ${res?.status ?? "unreachable"}`)
    return "200 OK"
  }))

  results.push(await time("canned_messages", async () => {
    const res = await fetch("http://localhost:5000/api/telemed/canned-messages").catch(() => null)
    if (!res?.ok) throw new Error(`Status ${res?.status ?? "unreachable"}`)
    return "200 OK"
  }))

  results.push(await time("acceptance_analytics", async () => {
    const res = await fetch("http://localhost:5000/api/acceptance-analytics/summary").catch(() => null)
    if (!res?.ok) throw new Error(`Status ${res?.status ?? "unreachable"}`)
    return "200 OK"
  }))

  const ok = results.every((r) => r.ok)
  return { ok, results }
}

async function time(test: string, fn: () => Promise<string>): Promise<SmokeTestResult> {
  const t0 = Date.now()
  try {
    const detail = await fn()
    return { test, ok: true, durationMs: Date.now() - t0, detail }
  } catch (err: any) {
    return { test, ok: false, durationMs: Date.now() - t0, detail: err.message }
  }
}
