async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

export const caseSimilarityApi = {
  rebuildIndex() {
    return postJson<{ ok: boolean; result: any }>("/api/similarity/rebuild-index", {})
  },

  getByCaseId(caseId: string, limit = 5) {
    return getJson<{ ok: boolean; result: any }>(
      `/api/similarity/case/${encodeURIComponent(caseId)}?limit=${limit}`
    )
  },

  fromState(state: any, limit = 5) {
    return postJson<{ ok: boolean; result: any }>("/api/similarity/from-state", { state, limit })
  },

  getWeightedDifferential(caseId: string) {
    return getJson<{ ok: boolean; result: any }>(
      `/api/similarity/differential/${encodeURIComponent(caseId)}`
    )
  },

  getWeightedDifferentialFromState(state: any) {
    return postJson<{ ok: boolean; result: any }>("/api/similarity/differential/from-state", { state })
  },

  indexCase(state: any, outcome?: any) {
    return postJson<{ ok: boolean }>("/api/similarity/index-case", { state, outcome })
  },

  getMetrics() {
    return getJson<{ ok: boolean; metrics: any; cache: any; eventStream: any }>("/api/platform-metrics")
  },
}
