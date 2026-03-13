export interface ConfidenceResult {
  diagnosis: string
  probability: number
  ruleScore: number
  similarityScore: number
  confidence: number
  explanation: string[]
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const diagnosticConfidenceApi = {
  getForCase(caseId: string) {
    return getJson<{ ok: boolean; result: ConfidenceResult[] }>(
      `/api/diagnostics/confidence/${caseId}`
    )
  },
  fromState(state: any) {
    return postJson<{ ok: boolean; result: ConfidenceResult[] }>(
      "/api/diagnostics/confidence/from-state",
      { state }
    )
  },
}
