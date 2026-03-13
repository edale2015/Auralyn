export interface TriageCase {
  caseId: string
  complaint: string
  disposition?: string
  symptoms?: string
  redFlags?: string[]
  riskScore?: number
  createdAt: string
  waitMinutes?: number
}

export interface PrioritizedCase extends TriageCase {
  urgencyScore: number
  urgencyLevel: "immediate" | "urgent" | "semi-urgent" | "non-urgent"
  priorityReason: string[]
}

const DISPOSITION_URGENCY: Record<string, number> = {
  er_now: 1.0,
  er_today: 0.8,
  urgent_care: 0.6,
  telemedicine: 0.3,
  self_care: 0.1,
  follow_up: 0.2,
}

const HIGH_RISK_COMPLAINTS: Record<string, number> = {
  chest_pain: 0.8,
  shortness_of_breath: 0.75,
  altered_consciousness: 0.90,
  stroke_symptoms: 0.95,
  headache: 0.5,
  abdominal_pain: 0.5,
  cough: 0.3,
  sore_throat: 0.25,
  fever: 0.40,
  uti: 0.30,
}

export function computeUrgencyScore(c: TriageCase): number {
  let score = DISPOSITION_URGENCY[c.disposition ?? ""] ?? 0.3
  score += (HIGH_RISK_COMPLAINTS[c.complaint] ?? 0.2) * 0.3
  if (c.redFlags?.length) score += Math.min(0.3, c.redFlags.length * 0.1)
  if (c.riskScore) score = Math.max(score, c.riskScore)
  const waitMs = c.waitMinutes ? c.waitMinutes * 60 * 1000 : Date.now() - new Date(c.createdAt).getTime()
  const waitMinutes = waitMs / 60000
  if (waitMinutes > 60) score += 0.15
  if (waitMinutes > 120) score += 0.10
  return Math.min(1.0, score)
}

export function prioritizeCases(cases: TriageCase[]): PrioritizedCase[] {
  return cases
    .map((c) => {
      const urgencyScore = computeUrgencyScore(c)
      const reasons: string[] = []

      if (c.disposition === "er_now") reasons.push("ER disposition")
      if (c.redFlags?.length) reasons.push(`${c.redFlags.length} red flag(s)`)
      if (c.riskScore && c.riskScore > 0.6) reasons.push(`high risk score (${(c.riskScore * 100).toFixed(0)}%)`)

      const waitMs = Date.now() - new Date(c.createdAt).getTime()
      const waitMin = Math.floor(waitMs / 60000)
      if (waitMin > 60) reasons.push(`waiting ${waitMin} min`)

      let urgencyLevel: PrioritizedCase["urgencyLevel"] = "non-urgent"
      if (urgencyScore >= 0.75) urgencyLevel = "immediate"
      else if (urgencyScore >= 0.55) urgencyLevel = "urgent"
      else if (urgencyScore >= 0.35) urgencyLevel = "semi-urgent"

      return {
        ...c,
        urgencyScore,
        urgencyLevel,
        priorityReason: reasons,
      }
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
}
