export interface ShapFactor {
  name: string
  contribution: number
  direction: "for" | "against" | "neutral"
  description: string
  weight: number
}

export interface ShapExplanation {
  winner: string
  winnerDomain: string
  baseScore: number
  finalScore: number
  factors: ShapFactor[]
  narrative: string
}

export function explainWinner(params: {
  debateWinner: { agentId: string; conclusion: string; confidence: number } | null
  opinions: Array<{ agentId: string; domain: string; conclusion: string; confidence: number; reasoning: string }>
  safetyAlerts: Array<{ message: string; severity: string }>
  uncertainty: number
  fusion: { dominantSignal: string; overrideApplied: boolean; finalPriority: string }
  escalation: { priority: string } | null
  safetyGovernorOverride: boolean
}): ShapExplanation {
  const { debateWinner, opinions, safetyAlerts, uncertainty, fusion, escalation, safetyGovernorOverride } = params

  const winner = safetyGovernorOverride
    ? { agentId: "safety_governor", domain: "safety", conclusion: fusion.finalPriority, confidence: 1 }
    : debateWinner
      ? { agentId: debateWinner.agentId, domain: opinions.find(o => o.agentId === debateWinner.agentId)?.domain ?? "unknown", conclusion: debateWinner.conclusion, confidence: debateWinner.confidence }
      : { agentId: "fallback", domain: "triage", conclusion: "unknown", confidence: 0 }

  const BASE = 0.3
  const factors: ShapFactor[] = []

  const confidenceLift = winner.confidence - 0.5
  factors.push({
    name: "Agent Confidence",
    contribution: Math.round(confidenceLift * 40) / 100,
    direction: confidenceLift >= 0 ? "for" : "against",
    description: `Winning agent confidence: ${(winner.confidence * 100).toFixed(0)}%`,
    weight: winner.confidence,
  })

  const safetyContrib = safetyAlerts.length > 0 ? 0.35 : 0
  if (safetyContrib > 0) {
    factors.push({
      name: "Safety Override",
      contribution: safetyContrib,
      direction: "for",
      description: `${safetyAlerts.length} safety alert(s) forced hard override`,
      weight: 1.0,
    })
  }

  const consensusOp = opinions.filter(o => o.conclusion === winner.conclusion)
  const consensusRatio = opinions.length > 0 ? consensusOp.length / opinions.length : 0
  const consensusContrib = (consensusRatio - 0.5) * 0.2
  factors.push({
    name: "Agent Consensus",
    contribution: Math.round(consensusContrib * 100) / 100,
    direction: consensusRatio >= 0.5 ? "for" : "against",
    description: `${consensusOp.length}/${opinions.length} agents agreed on this conclusion`,
    weight: consensusRatio,
  })

  const uncertaintyContrib = -(uncertainty * 0.15)
  factors.push({
    name: "Uncertainty Penalty",
    contribution: Math.round(uncertaintyContrib * 100) / 100,
    direction: uncertainty > 0.4 ? "against" : "neutral",
    description: `Uncertainty level: ${(uncertainty * 100).toFixed(0)}% — penalizes final score`,
    weight: 1 - uncertainty,
  })

  const fusionContrib = fusion.dominantSignal === "safety_alert" ? 0.3
    : fusion.dominantSignal === "consensus" ? 0.1
    : fusion.overrideApplied ? 0.2 : 0.05
  factors.push({
    name: "Fusion Signal",
    contribution: fusionContrib,
    direction: "for",
    description: `Clinical fusion dominant signal: ${fusion.dominantSignal}`,
    weight: fusionContrib,
  })

  if (escalation) {
    const escContrib = escalation.priority === "emergency" ? 0.25 : 0.1
    factors.push({
      name: "Escalation Trigger",
      contribution: escContrib,
      direction: "for",
      description: `Escalation bundle activated at ${escalation.priority} priority`,
      weight: escContrib,
    })
  }

  if (winner.domain === "diagnosis") {
    const competitorGap = opinions.length > 1
      ? winner.confidence - Math.max(...opinions.filter(o => o.agentId !== winner.agentId).map(o => o.confidence), 0)
      : 0.2
    factors.push({
      name: "Diagnostic Lead",
      contribution: Math.round(Math.max(0, competitorGap) * 0.25 * 100) / 100,
      direction: competitorGap > 0 ? "for" : "against",
      description: `This agent led competitors by ${(competitorGap * 100).toFixed(0)}% confidence`,
      weight: Math.max(0, competitorGap),
    })
  }

  factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

  const totalContrib = factors.reduce((s, f) => s + f.contribution, 0)
  const finalScore = Math.min(1, Math.max(0, BASE + totalContrib))

  const topFactor = factors[0]
  const narrative = safetyGovernorOverride
    ? `Safety Governor issued a hard override — all safety alerts mandate emergency triage regardless of agent consensus.`
    : topFactor
      ? `${winner.agentId} won primarily because of ${topFactor.name.toLowerCase()} (${topFactor.contribution > 0 ? "+" : ""}${(topFactor.contribution * 100).toFixed(0)}pts). ${topFactor.description}.`
      : `${winner.agentId} had the highest weighted confidence among ${opinions.length} competing agents.`

  return {
    winner: winner.agentId,
    winnerDomain: winner.domain,
    baseScore: BASE,
    finalScore: Math.round(finalScore * 1000) / 1000,
    factors,
    narrative,
  }
}
