export interface AgentRecord {
  agentId: string
  domain: string
  wins: number
  total: number
  recentWins: number[]
  recentTotal: number[]
  lastSeen: number
}

export interface AgentDriftEvent {
  agentId: string
  windowWinRate: number
  overallWinRate: number
  delta: number
  direction: "rising" | "falling" | "stable"
  detectedAt: number
}

export interface AgentPerformanceReport {
  agents: Array<{
    agentId: string
    domain: string
    winRate: number
    wins: number
    total: number
    trend: "rising" | "falling" | "stable"
    driftAlert: boolean
    recentWinRate: number
  }>
  driftEvents: AgentDriftEvent[]
  topAgent: string
  bottomAgent: string
  updatedAt: number
}

const WINDOW = 10
const DRIFT_THRESHOLD = 0.18

const records = new Map<string, AgentRecord>()
const driftLog: AgentDriftEvent[] = []

export function recordAgentOutcome(agentId: string, domain: string, won: boolean): void {
  let rec = records.get(agentId)
  if (!rec) {
    rec = { agentId, domain, wins: 0, total: 0, recentWins: [], recentTotal: [], lastSeen: Date.now() }
    records.set(agentId, rec)
  }

  rec.total++
  if (won) rec.wins++
  rec.lastSeen = Date.now()

  rec.recentWins.push(won ? 1 : 0)
  rec.recentTotal.push(1)
  if (rec.recentWins.length > WINDOW) {
    rec.recentWins.shift()
    rec.recentTotal.shift()
  }

  const overallRate = rec.wins / rec.total
  const windowRate = rec.recentWins.reduce((s, v) => s + v, 0) / rec.recentWins.length
  const delta = windowRate - overallRate

  if (Math.abs(delta) >= DRIFT_THRESHOLD) {
    const event: AgentDriftEvent = {
      agentId,
      windowWinRate: Math.round(windowRate * 1000) / 1000,
      overallWinRate: Math.round(overallRate * 1000) / 1000,
      delta: Math.round(delta * 1000) / 1000,
      direction: delta > 0 ? "rising" : "falling",
      detectedAt: Date.now(),
    }
    driftLog.push(event)
    if (driftLog.length > 200) driftLog.shift()
  }
}

export function recordDebateRound(
  opinions: Array<{ agentId: string; domain: string }>,
  winnerId: string
): void {
  for (const op of opinions) {
    recordAgentOutcome(op.agentId, op.domain, op.agentId === winnerId)
  }
}

export function getAgentPerformance(): AgentPerformanceReport {
  const agents = [...records.values()].map(rec => {
    const winRate = rec.total > 0 ? rec.wins / rec.total : 0
    const recentRate = rec.recentWins.length > 0
      ? rec.recentWins.reduce((s, v) => s + v, 0) / rec.recentWins.length
      : winRate
    const delta = recentRate - winRate
    const trend: "rising" | "falling" | "stable" =
      Math.abs(delta) < 0.05 ? "stable" : delta > 0 ? "rising" : "falling"
    const driftAlert = Math.abs(delta) >= DRIFT_THRESHOLD

    return {
      agentId: rec.agentId,
      domain: rec.domain,
      winRate: Math.round(winRate * 1000) / 1000,
      wins: rec.wins,
      total: rec.total,
      trend,
      driftAlert,
      recentWinRate: Math.round(recentRate * 1000) / 1000,
    }
  }).sort((a, b) => b.winRate - a.winRate)

  const topAgent = agents[0]?.agentId ?? "none"
  const bottomAgent = agents[agents.length - 1]?.agentId ?? "none"

  return {
    agents,
    driftEvents: driftLog.slice(-20),
    topAgent,
    bottomAgent,
    updatedAt: Date.now(),
  }
}

export function getRecentDriftEvents(limit = 10): AgentDriftEvent[] {
  return driftLog.slice(-limit)
}
