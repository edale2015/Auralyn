export interface WeightedQuestion {
  text: string
  expectedInfoGain: number
  policyWeight: number
  adjustedScore: number
  targetDiagnoses: string[]
}

export interface QuestionPolicy {
  question: string
  complaint: string
  weight: number
  timesAsked: number
  timesImproved: number
  avgEntropyReduction: number
  avgDiagnosisShift: number
  lastUpdated: string
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

export const adaptiveQuestionApi = {
  getForCase(caseId: string) {
    return getJson<{ ok: boolean; complaint: string; questions: WeightedQuestion[] }>(
      `/api/aqle/questions/${caseId}`
    )
  },
  fromState(state: any, external?: any[]) {
    return postJson<{ ok: boolean; complaint: string; questions: WeightedQuestion[] }>(
      "/api/aqle/questions/from-state",
      { state, external }
    )
  },
  recordAnswer(payload: {
    caseId: string
    complaint: string
    question: string
    stateBefore: any
    stateAfter: any
  }) {
    return postJson<{ ok: boolean }>("/api/aqle/record-answer", payload)
  },
  train(complaint?: string) {
    return postJson<{ ok: boolean; results: any[]; count: number }>(
      "/api/aqle/train",
      { complaint }
    )
  },
  getPolicies() {
    return getJson<{ ok: boolean; policies: QuestionPolicy[]; count: number }>(
      "/api/aqle/policies"
    )
  },
}
